import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { LLAMA_TAG, llamaAsset, type CatalogModel } from './catalog'
import { downloadFile } from './download'

const execFileAsync = promisify(execFile)

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

// Depth-first search for a file, skipping unreadable dirs. The release
// tarballs nest everything under one llama-<tag>/ folder, but that's their
// layout to change, so the binary is found by name rather than by path.
async function findFile(dir: string, matches: (name: string, path: string) => Promise<boolean>, depth: number): Promise<string | null> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (!entry.isDirectory() && await matches(entry.name, path)) return path
  }
  if (depth === 0) return null
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const found = await findFile(join(dir, entry.name), matches, depth - 1)
    if (found) return found
  }
  return null
}

// Where vIDE keeps its pinned llama.cpp: shared by autocomplete and by the
// Llama feature's install button, so a Mac needs only one copy.
export function bundledLlamaDir(userDataDir: string): string {
  return join(userDataDir, 'autocomplete', 'llama.cpp')
}

// vIDE always runs its own pinned build (never a llama-server on PATH), kept
// under rootDir/<tag>/ so a tag bump installs alongside instead of over it.
export function findInstalledLlamaServer(rootDir: string): Promise<string | null> {
  return findFile(join(rootDir, LLAMA_TAG), async (name, path) => name === 'llama-server' && isExecutable(path), 3)
}

export async function installLlama(
  rootDir: string,
  opts: { signal?: AbortSignal; onProgress?: (received: number, total: number) => void; download?: typeof downloadFile } = {}
): Promise<string> {
  const asset = llamaAsset(process.platform)
  if (!asset) throw new Error(`llama.cpp has no prebuilt build for ${process.platform}`)
  const download = opts.download ?? downloadFile
  const target = join(rootDir, LLAMA_TAG)
  const archive = join(rootDir, `${LLAMA_TAG}.tar.gz`)
  await mkdir(target, { recursive: true })
  await download(asset.url, archive, { expectedBytes: asset.bytes, signal: opts.signal, onProgress: opts.onProgress })
  try {
    await execFileAsync('tar', ['xzf', archive, '-C', target])
  } finally {
    await rm(archive, { force: true })
  }
  const binary = await findInstalledLlamaServer(rootDir)
  if (!binary) throw new Error('llama-server was not found in the downloaded llama.cpp build')
  return binary
}

// llama.cpp's own download cache (`llama-server -hf …`), where a user who has
// already pulled the same model keeps it — reused rather than downloaded again.
export function llamaCacheDir(): string {
  if (process.env.LLAMA_CACHE) return process.env.LLAMA_CACHE
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'llama.cpp')
  return join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'llama.cpp')
}

// A model counts as on disk only at its exact catalog size, so a .part, a
// truncated copy or another quant under the same name is never picked up.
// `-hf` downloads are named `<owner>_<repo>_<file>`.
export function findModelOnDisk(model: CatalogModel, dirs: string[]): Promise<string | null> {
  const matches = async (name: string, path: string) => {
    if (name !== model.fileName && !name.endsWith(`_${model.fileName}`)) return false
    try {
      return (await stat(path)).size === model.bytes
    } catch {
      return false
    }
  }
  return dirs.reduce<Promise<string | null>>(
    async (found, dir) => (await found) ?? findFile(dir, matches, 2),
    Promise.resolve(null)
  )
}
