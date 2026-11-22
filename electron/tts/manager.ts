import { execFile, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { ipcMain, type WebContents } from 'electron'
import { downloadFile } from '../autocomplete/download'
import { engineAsset, SHERPA_TAG, synthArgs, voiceById, voiceFolder, voiceUrl, VOICES, type TtsVoiceInfo } from './catalog'

const execFileAsync = promisify(execFile)

const BINARY = 'sherpa-onnx-offline-tts'
// A long reply at slow speed still finishes well inside this.
const SYNTH_TIMEOUT_MS = 60_000

export interface TtsInstallInfo { path: string | null; source: 'vide' | null; downloadBytes: number | null }
export type TtsResult = { ok: true } | { ok: false; error: string }
export type TtsSpeakResult = { ok: true; wav: Uint8Array } | { ok: false; error: string }

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// Everything lives under userData/tts: engine/<tag>/<release folder>/{bin,lib}
// and voices/vits-piper-<model>/. Per machine, never synced.
export class TtsManager {
  private engineInstall: Promise<{ ok: true; path: string } | { ok: false; error: string }> | null = null
  private voiceInstalls = new Map<string, Promise<TtsResult>>()
  private speaking: ChildProcess | null = null

  constructor(private rootDir: string) {}

  private get engineDir(): string { return join(this.rootDir, 'engine', SHERPA_TAG) }
  private get voicesDir(): string { return join(this.rootDir, 'voices') }

  // The release tarball nests bin/ and lib/ under one folder whose name is
  // theirs to change, so the binary is found one level down by name.
  async findBinary(): Promise<string | null> {
    let entries
    try {
      entries = await readdir(this.engineDir, { withFileTypes: true })
    } catch {
      return null
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const candidate = join(this.engineDir, entry.name, 'bin', BINARY)
      if (await isExecutable(candidate)) return candidate
    }
    return null
  }

  async getInstall(): Promise<TtsInstallInfo> {
    const path = await this.findBinary()
    return { path, source: path ? 'vide' : null, downloadBytes: engineAsset(process.platform)?.bytes ?? null }
  }

  private async voiceInstalled(id: string): Promise<boolean> {
    const voice = voiceById(id)
    return !!voice && exists(join(this.voicesDir, voiceFolder(voice), `${voice.model}.onnx`))
  }

  async listVoices(): Promise<TtsVoiceInfo[]> {
    return Promise.all(VOICES.map(async (v) => ({
      id: v.id,
      name: v.name,
      description: v.description,
      bytes: v.bytes,
      recommended: !!v.recommended,
      installed: await this.voiceInstalled(v.id),
    })))
  }

  private async downloadAndExtract(url: string, bytes: number, archive: string, target: string, onProgress: (r: number, t: number) => void): Promise<void> {
    await mkdir(target, { recursive: true })
    await downloadFile(url, archive, { expectedBytes: bytes, onProgress })
    try {
      await execFileAsync('tar', ['xjf', archive, '-C', target])
    } finally {
      await rm(archive, { force: true })
    }
  }

  // One engine install at a time, however many windows ask.
  installEngine(sender: WebContents): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
    if (this.engineInstall) return this.engineInstall
    const asset = engineAsset(process.platform)
    if (!asset) return Promise.resolve({ ok: false, error: `No speech engine build for ${process.platform} ${process.arch}` })
    const run = this.downloadAndExtract(asset.url, asset.bytes, join(this.rootDir, `sherpa-onnx-${SHERPA_TAG}.tar.bz2`), this.engineDir,
      (r, t) => { if (!sender.isDestroyed()) sender.send('tts:installProgress', r, t) })
      .then(async () => {
        const path = await this.findBinary()
        return path ? { ok: true as const, path } : { ok: false as const, error: `${BINARY} was not found in the download` }
      })
      .catch((err: unknown) => ({ ok: false as const, error: message(err) }))
      .finally(() => { this.engineInstall = null })
    this.engineInstall = run
    return run
  }

  installVoice(sender: WebContents, id: string): Promise<TtsResult> {
    const running = this.voiceInstalls.get(id)
    if (running) return running
    const voice = voiceById(id)
    if (!voice) return Promise.resolve({ ok: false, error: `Unknown voice: ${id}` })
    const run = this.downloadAndExtract(voiceUrl(voice), voice.bytes, join(this.voicesDir, `${voiceFolder(voice)}.tar.bz2`), this.voicesDir,
      (r, t) => { if (!sender.isDestroyed()) sender.send('tts:voiceProgress', id, r, t) })
      .then(async () => (await this.voiceInstalled(id)) ? { ok: true as const } : { ok: false as const, error: 'The voice download was incomplete' })
      .catch((err: unknown) => ({ ok: false as const, error: message(err) }))
      .finally(() => { this.voiceInstalls.delete(id) })
    this.voiceInstalls.set(id, run)
    return run
  }

  async removeVoice(id: string): Promise<TtsResult> {
    const voice = voiceById(id)
    if (!voice) return { ok: false, error: `Unknown voice: ${id}` }
    await rm(join(this.voicesDir, voiceFolder(voice)), { recursive: true, force: true })
    return { ok: true }
  }

  stop(): void {
    this.speaking?.kill()
    this.speaking = null
  }

  // Synthesizes `text` to a temp WAV and returns its bytes; the renderer plays
  // them. A new call cancels one still synthesizing.
  async speak(text: string, voiceId: string, speed: number): Promise<TtsSpeakResult> {
    const trimmed = text.trim()
    if (!trimmed) return { ok: false, error: 'Nothing to say' }
    const binary = await this.findBinary()
    if (!binary) return { ok: false, error: 'The speech engine is not installed' }
    const voice = voiceById(voiceId)
    if (!voice || !(await this.voiceInstalled(voiceId))) return { ok: false, error: 'That voice is not installed' }

    this.stop()
    const out = join(tmpdir(), `vide-tts-${randomUUID()}.wav`)
    const lib = join(dirname(dirname(binary)), 'lib')
    try {
      await new Promise<void>((resolve, reject) => {
        const child = execFile(binary, synthArgs(join(this.voicesDir, voiceFolder(voice)), voice, speed, out, trimmed), {
          timeout: SYNTH_TIMEOUT_MS,
          env: { ...process.env, DYLD_LIBRARY_PATH: lib, LD_LIBRARY_PATH: lib },
        }, (err) => {
          if (this.speaking === child) this.speaking = null
          if (err) reject(err)
          else resolve()
        })
        this.speaking = child
      })
      return { ok: true, wav: new Uint8Array(await readFile(out)) }
    } catch (err) {
      return { ok: false, error: message(err) }
    } finally {
      await rm(out, { force: true })
    }
  }

  registerHandlers(): void {
    ipcMain.handle('tts:getInstall', () => this.getInstall())
    ipcMain.handle('tts:install', (event) => this.installEngine(event.sender))
    ipcMain.handle('tts:listVoices', () => this.listVoices())
    ipcMain.handle('tts:installVoice', (event, id: string) => this.installVoice(event.sender, id))
    ipcMain.handle('tts:removeVoice', (_event, id: string) => this.removeVoice(id))
    ipcMain.handle('tts:speak', (_event, text: string, voiceId: string, speed: number) => this.speak(String(text ?? ''), String(voiceId ?? ''), Number(speed)))
    ipcMain.handle('tts:stop', () => this.stop())
  }
}
