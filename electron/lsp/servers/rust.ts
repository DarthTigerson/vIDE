import { existsSync } from 'fs'
import { chmod, mkdir, writeFile } from 'fs/promises'
import https from 'https'
import { homedir, arch, platform } from 'os'
import { join } from 'path'
import { gunzipSync } from 'zlib'
import { resolveBinaryPath, resolveVersion } from '../shellPath'
import type { LspServerModule } from '../types'

// rust-analyzer has no npm/go-style installer, but does publish prebuilt
// per-platform binaries on its GitHub releases — download+extract that
// directly rather than requiring the user to have Rust/cargo installed just
// to get the language server. Only the two platforms vIDE itself ships for
// (see CLAUDE.md: macOS Apple Silicon, Linux x86_64) are supported here.
const MANAGED_DIR = join(homedir(), '.vide', 'lsp', 'bin')
const MANAGED_PATH = join(MANAGED_DIR, 'rust-analyzer')

function releaseAssetName(): string | null {
  if (platform() === 'darwin' && arch() === 'arm64') return 'rust-analyzer-aarch64-apple-darwin.gz'
  if (platform() === 'linux' && arch() === 'x64') return 'rust-analyzer-x86_64-unknown-linux-gnu.gz'
  return null
}

async function resolvedPath(): Promise<string | null> {
  const onPath = await resolveBinaryPath('rust-analyzer')
  if (onPath) return onPath
  return existsSync(MANAGED_PATH) ? MANAGED_PATH : null
}

function download(url: string, redirectsLeft = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'vide' } }, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume()
          download(res.headers.location, redirectsLeft - 1).then(resolve, reject)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`))
          res.resume()
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

export const rustServer: LspServerModule = {
  id: 'rust',
  label: 'Rust',
  monacoLanguageIds: ['rust'],
  ramEstimate: 'typically 300MB–1.5GB on large crates/workspaces',

  async detect() {
    const path = await resolvedPath()
    if (!path) return { found: false }
    const version = await resolveVersion(path, ['--version'])
    return { found: true, path, version: version ?? undefined }
  },

  async getSpawn() {
    const path = await resolvedPath()
    if (!path) return null
    return { command: path, args: [] }
  },

  async install(onData) {
    const asset = releaseAssetName()
    if (!asset) throw new Error('No prebuilt rust-analyzer binary is published for this platform.')
    onData(`Downloading ${asset} from rust-analyzer's latest GitHub release…\n`)
    const gz = await download(`https://github.com/rust-lang/rust-analyzer/releases/latest/download/${asset}`)
    onData('Extracting…\n')
    const bin = gunzipSync(gz)
    await mkdir(MANAGED_DIR, { recursive: true })
    await writeFile(MANAGED_PATH, bin)
    await chmod(MANAGED_PATH, 0o755)
    onData(`Installed to ${MANAGED_PATH}\n`)
  },
}
