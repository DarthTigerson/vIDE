import { existsSync } from 'fs'
import { chmod, mkdir, rename, writeFile } from 'fs/promises'
import { arch, homedir, platform } from 'os'
import { join } from 'path'
import { gunzipSync } from 'zlib'
import { download } from './download'
import { npmInstallGlobal, resolveNpmBinary } from './nodeRuntime'
import { resolveAndRunStreamed, resolveBinaryPath, resolveGoBinary, resolveVersion } from './shellPath'
import { BINARY_RE, type LanguageServerEntry, type LspPlatform } from './catalog'
import type { DetectResult, SpawnSpec } from './types'

// The three fixed ways vIDE gets a language server, parameterised by a Store
// catalog entry (catalog.ts). Nothing here runs a command the entry spelled
// out: the entry only names packages/assets, already whitelisted by the parser.

// Where `github-release` downloads land (rust-analyzer has always lived here).
export const MANAGED_BIN_DIR = join(homedir(), '.vide', 'lsp', 'bin')

type OnData = (chunk: string) => void

export function currentPlatform(): LspPlatform | null {
  if (platform() === 'darwin' && arch() === 'arm64') return 'darwin-arm64'
  if (platform() === 'linux' && arch() === 'x64') return 'linux-x64'
  return null
}

export interface InstallDeps {
  npmInstallGlobal: (packages: string[], onData: OnData) => Promise<void>
  runStreamed: (command: string, args: string[], onData: OnData) => Promise<void>
  download: (url: string) => Promise<Buffer>
  managedDir: string
  platform: () => LspPlatform | null
}

const defaultDeps: InstallDeps = {
  npmInstallGlobal,
  runStreamed: resolveAndRunStreamed,
  download,
  managedDir: MANAGED_BIN_DIR,
  platform: currentPlatform,
}

export interface ResolveDeps {
  onPath: (name: string) => Promise<string | null>
  npmBinary: (name: string) => Promise<string | null>
  goBinary: (name: string) => Promise<string | null>
  managedDir: string
}

const defaultResolveDeps: ResolveDeps = {
  onPath: resolveBinaryPath,
  npmBinary: resolveNpmBinary,
  goBinary: resolveGoBinary,
  managedDir: MANAGED_BIN_DIR,
}

// Absolute path of the entry's binary, looking where its install method puts
// it as well as on PATH, or null when it is not installed.
export async function resolveServerBinary(entry: LanguageServerEntry, deps: ResolveDeps = defaultResolveDeps): Promise<string | null> {
  // The parser already enforces this; repeated because `binary` reaches a shell.
  if (!BINARY_RE.test(entry.binary)) return null
  switch (entry.install.method) {
    case 'npm':
      return deps.npmBinary(entry.binary)
    case 'go':
      return (await deps.onPath(entry.binary)) ?? (await deps.goBinary(entry.binary))
    case 'github-release': {
      const onPath = await deps.onPath(entry.binary)
      if (onPath) return onPath
      const managed = join(deps.managedDir, entry.binary)
      return existsSync(managed) ? managed : null
    }
  }
}

export async function detectServer(entry: LanguageServerEntry, deps: ResolveDeps = defaultResolveDeps): Promise<DetectResult> {
  const path = await resolveServerBinary(entry, deps)
  if (!path) return { found: false }
  const version = await resolveVersion(path, entry.versionArgs)
  return { found: true, path, version: version ?? undefined }
}

export async function spawnSpecFor(entry: LanguageServerEntry, deps: ResolveDeps = defaultResolveDeps): Promise<SpawnSpec | null> {
  const path = await resolveServerBinary(entry, deps)
  return path ? { command: path, args: [...entry.args] } : null
}

export async function installServer(entry: LanguageServerEntry, onData: OnData, deps: InstallDeps = defaultDeps): Promise<void> {
  const install = entry.install
  switch (install.method) {
    case 'npm':
      onData(`npm install -g ${install.packages.join(' ')}\n`)
      return deps.npmInstallGlobal(install.packages, onData)
    case 'go':
      onData(`go install ${install.package}\n`)
      return deps.runStreamed('go', ['install', install.package], onData)
    case 'github-release': {
      const target = deps.platform()
      const asset = target ? install.assets[target] : undefined
      if (!asset) throw new Error(`No prebuilt ${entry.name} server is published for this platform.`)
      const url = `https://github.com/${install.repo}/releases/latest/download/${asset}`
      onData(`Downloading ${asset} from ${install.repo}'s latest GitHub release…\n`)
      const gz = await deps.download(url)
      onData('Extracting…\n')
      const bin = gunzipSync(gz)
      await mkdir(deps.managedDir, { recursive: true })
      const dest = join(deps.managedDir, entry.binary)
      // Written beside the target then renamed, so a running server's binary
      // is never half-overwritten.
      const tmp = `${dest}.download`
      await writeFile(tmp, bin)
      await chmod(tmp, 0o755)
      await rename(tmp, dest)
      onData(`Installed to ${dest}\n`)
      return
    }
  }
}
