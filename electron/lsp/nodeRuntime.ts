import { createHash } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'fs/promises'
import { arch, homedir, platform, userInfo } from 'os'
import { dirname, join } from 'path'
import { download } from './download'
import { resolveBinaryPath, runStreamed } from './shellPath'

// The JSON, Python, TypeScript and YAML servers are npm packages. When npm
// is missing, try in order: a private Node.js download into ~/.vide/lsp/node
// (no admin rights, touches nothing else), then the system package manager,
// then ask the user to install it.
export const MANAGED_NODE_DIR = join(homedir(), '.vide', 'lsp', 'node')
const MANAGED_BIN = join(MANAGED_NODE_DIR, 'bin')

export const NODE_REQUIRED =
  'Node.js is required for this language. Install it from https://nodejs.org/en/download, then click Install again.'

// Where Homebrew and apt put npm, in case the login shell PATH misses them.
const KNOWN_NPM_PATHS = ['/opt/homebrew/bin/npm', '/usr/local/bin/npm', '/usr/bin/npm']

type OnData = (chunk: string) => void

// A binary from an npm global install: on PATH, next to a known npm, or in
// the private Node.js.
export async function resolveNpmBinary(name: string): Promise<string | null> {
  const onPath = await resolveBinaryPath(name)
  if (onPath) return onPath
  const dirs = [...KNOWN_NPM_PATHS.map(dirname), MANAGED_BIN]
  return dirs.map((d) => join(d, name)).find((p) => existsSync(p)) ?? null
}

export async function npmInstallGlobal(packages: string[], onData: OnData): Promise<void> {
  const npm = await ensureNpm(onData)
  await runStreamed(npm, ['install', '-g', ...packages], onData, 'npm')
}

function findNpm(): Promise<string | null> {
  return resolveNpmBinary('npm')
}

export async function ensureNpm(onData: OnData): Promise<string> {
  const steps = [installPrivateNode, installWithPackageManager]
  let npm = await findNpm()
  if (!npm) onData('npm not found.\n')
  for (const step of steps) {
    if (npm) return npm
    try {
      await step(onData)
    } catch (e) {
      onData(`${e instanceof Error ? e.message : String(e)}\n`)
    }
    npm = await findNpm()
  }
  if (npm) return npm
  throw new Error(NODE_REQUIRED)
}

// Homebrew on macOS, apt-get on Linux. apt-get needs root, so it only runs
// as root or with passwordless sudo; sudo -n fails at once otherwise.
export async function installWithPackageManager(onData: OnData): Promise<void> {
  if (platform() === 'darwin') {
    const brew = (await resolveBinaryPath('brew')) ?? ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].find((p) => existsSync(p))
    if (!brew) throw new Error('Homebrew is not installed.')
    onData('Installing Node.js with Homebrew (brew install node)…\n')
    await runStreamed(brew, ['install', 'node'], onData, 'brew', { HOMEBREW_NO_AUTO_UPDATE: '1', NONINTERACTIVE: '1' })
    return
  }
  const apt = await resolveBinaryPath('apt-get')
  if (!apt) throw new Error('apt-get is not available.')
  onData('Installing Node.js with apt-get…\n')
  const env = { DEBIAN_FRONTEND: 'noninteractive' }
  const args = ['install', '-y', 'nodejs', 'npm']
  if (userInfo().uid === 0) await runStreamed(apt, args, onData, 'apt-get', env)
  else await runStreamed('sudo', ['-n', apt, ...args], onData, 'sudo apt-get', env)
}

function nodePlatform(): string | null {
  if (platform() === 'darwin' && arch() === 'arm64') return 'darwin-arm64'
  if (platform() === 'linux' && arch() === 'x64') return 'linux-x64'
  return null
}

// Latest LTS Node.js from nodejs.org, checksum verified, unpacked into
// MANAGED_NODE_DIR. Needs no admin rights and touches nothing else.
export async function installPrivateNode(onData: OnData, dir = MANAGED_NODE_DIR): Promise<void> {
  const target = nodePlatform()
  if (!target) throw new Error('No Node.js download is published for this platform.')
  onData('Finding the latest Node.js LTS release on nodejs.org…\n')
  const releases = JSON.parse((await download('https://nodejs.org/dist/index.json')).toString()) as { version: string; lts: string | false }[]
  const version = releases.find((r) => r.lts)?.version
  if (!version) throw new Error('Could not find a Node.js LTS release.')

  const file = `node-${version}-${target}.tar.gz`
  const base = `https://nodejs.org/dist/${version}`
  onData(`Downloading ${file}…\n`)
  const [archive, sums] = await Promise.all([download(`${base}/${file}`), download(`${base}/SHASUMS256.txt`)])
  const expected = sums.toString().split('\n').find((l) => l.trim().endsWith(` ${file}`))?.split(/\s+/)[0]
  const actual = createHash('sha256').update(archive).digest('hex')
  if (!expected || expected !== actual) throw new Error(`Checksum check failed for ${file}.`)

  onData('Extracting…\n')
  const parent = join(dir, '..')
  await mkdir(parent, { recursive: true })
  const tmp = await mkdtemp(join(parent, 'node-download-'))
  try {
    await writeFile(join(tmp, file), archive)
    await runStreamed('tar', ['-xzf', join(tmp, file), '-C', tmp], onData, 'tar')
    await rm(dir, { recursive: true, force: true })
    await rename(join(tmp, `node-${version}-${target}`), dir)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
  onData(`Installed Node.js ${version} to ${dir}\n`)
}
