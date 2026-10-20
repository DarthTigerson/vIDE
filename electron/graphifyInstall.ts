import { execFile } from 'node:child_process'
import { constants, existsSync } from 'node:fs'
import { access, mkdir, readdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { downloadFile } from './autocomplete/download'

const execFileAsync = promisify(execFile)

// graphify is a Python tool installed with uv (`uv tool install graphifyy`),
// and uv brings its own Python, so the one-click install needs nothing but
// uv. A machine without one gets vIDE's own pinned standalone build, kept
// under userData like vIDE's llama.cpp.
export const UV_VERSION = '0.11.1'

const UV_ASSETS: Record<string, { name: string; bytes: number }> = {
  'darwin-arm64': { name: 'uv-aarch64-apple-darwin.tar.gz', bytes: 20474937 },
  'linux-x64': { name: 'uv-x86_64-unknown-linux-gnu.tar.gz', bytes: 23844436 },
}

export function uvAsset(platform: string, arch: string): { url: string; bytes: number } | null {
  const asset = UV_ASSETS[`${platform}-${arch}`]
  if (!asset) return null
  return { url: `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${asset.name}`, bytes: asset.bytes }
}

export interface GraphifyInstaller {
  findUv(): Promise<string | null>
  downloadUv(opts?: { onProgress?: (received: number, total: number) => void }): Promise<string>
  installGraphify(uv: string): Promise<{ ok: boolean; output: string }>
  toolBinDir(uv: string): Promise<string | null>
}

async function isExecutable(path: string): Promise<boolean> {
  return access(path, constants.X_OK).then(() => true, () => false)
}

// The release tarball nests the binary one folder down (uv-<target>/uv).
async function findUvIn(dir: string): Promise<string | null> {
  const direct = join(dir, 'uv')
  if (await isExecutable(direct)) return direct
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory() && await isExecutable(join(dir, entry.name, 'uv'))) return join(dir, entry.name, 'uv')
  }
  return null
}

function loginShellLookup(command: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(process.env.SHELL ?? '/bin/zsh', ['-lic', `command -v ${command}`], (err, stdout) => {
      const last = (stdout ? stdout.toString() : '').split('\n').map((l) => l.trim()).filter(Boolean).pop()
      resolve(!err && last && last.startsWith('/') ? last : null)
    })
  })
}

export function createGraphifyInstaller(userDataDir: string): GraphifyInstaller {
  const uvDir = join(userDataDir, 'graphify', 'uv', UV_VERSION)
  return {
    // The user's own uv (PATH, or the standalone installer's ~/.local/bin),
    // then vIDE's copy from an earlier install.
    async findUv() {
      const onPath = await loginShellLookup('uv')
      if (onPath) return onPath
      const local = join(homedir(), '.local', 'bin', 'uv')
      if (existsSync(local) && await isExecutable(local)) return local
      return findUvIn(uvDir)
    },

    async downloadUv(opts = {}) {
      const asset = uvAsset(process.platform, process.arch)
      if (!asset) throw new Error(`uv has no prebuilt build for ${process.platform} ${process.arch}`)
      await mkdir(uvDir, { recursive: true })
      const archive = join(uvDir, 'uv.tar.gz')
      await downloadFile(asset.url, archive, { expectedBytes: asset.bytes, onProgress: opts.onProgress })
      try {
        await execFileAsync('tar', ['xzf', archive, '-C', uvDir])
      } finally {
        await rm(archive, { force: true })
      }
      const uv = await findUvIn(uvDir)
      if (!uv) throw new Error('uv was not found in the downloaded build')
      return uv
    },

    async installGraphify(uv) {
      try {
        const { stdout, stderr } = await execFileAsync(uv, ['tool', 'install', 'graphifyy'], { timeout: 10 * 60_000 })
        return { ok: true, output: `${stdout}${stderr}` }
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string; message?: string }
        return { ok: false, output: `${e.stderr ?? ''}${e.stdout ?? ''}`.trim() || (e.message ?? String(err)) }
      }
    },

    async toolBinDir(uv) {
      try {
        const { stdout } = await execFileAsync(uv, ['tool', 'dir', '--bin'])
        return stdout.trim() || null
      } catch {
        return null
      }
    },
  }
}
