// Language-server entries from the vSuite Store catalog (`registry.json`'s
// top-level `languageServers`, next to `apps`). Pure validation, no Electron
// imports, so it unit-tests in plain node.
// Spec: docs/superpowers/specs/2026-11-16-language-servers-store-design.md
//
// An entry is data only: which binary to run and which of vIDE's fixed install
// methods gets it. Nothing here can make vIDE run an arbitrary command, so
// every string that reaches a process (binary, args, package names) is held
// to a whitelist. `binary` in particular is passed to `command -v` in a login
// shell (shellPath.resolveBinaryPath).

export const LSP_PLATFORMS = ['darwin-arm64', 'linux-x64'] as const
export type LspPlatform = (typeof LSP_PLATFORMS)[number]

export type LspInstallMethod =
  | { method: 'npm'; packages: string[] }
  | { method: 'go'; package: string }
  | { method: 'github-release'; repo: string; assets: Partial<Record<LspPlatform, string>>; format: 'gz' }

export interface LanguageServerEntry {
  id: string
  name: string
  description: string
  targets: string[]
  // Monaco language ids this server answers for.
  languages: string[]
  binary: string
  args: string[]
  versionArgs: string[]
  ramEstimate?: string
  homepage?: string
  install: LspInstallMethod
}

export const LSP_CATEGORY = 'language-servers'
const MAX_ENTRIES = 100

const ID_RE = /^[a-z0-9-]+$/
const LANGUAGE_RE = /^[a-z0-9][a-z0-9.+#-]{0,39}$/
export const BINARY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const ARG_RE = /^[A-Za-z0-9_][A-Za-z0-9_.=:/,+-]{0,127}$|^--?[A-Za-z0-9][A-Za-z0-9_.=:/,+-]{0,127}$/
// npm: optional @scope/, a name, optional @version/tag. No leading '-'.
const NPM_PACKAGE_RE = /^(@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*(@[A-Za-z0-9._^~-]+)?$/
// Go: a module path with at least one slash, then @version.
const GO_PACKAGE_RE = /^[a-z0-9][a-z0-9.-]*(\/[A-Za-z0-9._~-]+)+@[A-Za-z0-9._+-]+$/
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const ASSET_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function stringList(value: unknown, re: RegExp, max: number): string[] | null {
  if (!Array.isArray(value) || value.length > max) return null
  return value.every((v) => typeof v === 'string' && re.test(v)) ? [...(value as string[])] : null
}

function parseInstall(raw: unknown): LspInstallMethod | string {
  if (!isObject(raw)) return 'install missing'
  switch (raw.method) {
    case 'npm': {
      const packages = stringList(raw.packages, NPM_PACKAGE_RE, 8)
      if (!packages || packages.length === 0) return 'bad install.packages'
      return { method: 'npm', packages }
    }
    case 'go':
      if (typeof raw.package !== 'string' || !GO_PACKAGE_RE.test(raw.package)) return 'bad install.package'
      return { method: 'go', package: raw.package }
    case 'github-release': {
      if (typeof raw.repo !== 'string' || !REPO_RE.test(raw.repo)) return 'bad install.repo'
      if (raw.format !== 'gz') return 'bad install.format'
      if (!isObject(raw.assets)) return 'bad install.assets'
      const assets: Partial<Record<LspPlatform, string>> = {}
      for (const [platform, asset] of Object.entries(raw.assets)) {
        if (!(LSP_PLATFORMS as readonly string[]).includes(platform)) return `bad install.assets platform ${platform}`
        if (typeof asset !== 'string' || !ASSET_RE.test(asset)) return 'bad install.assets name'
        assets[platform as LspPlatform] = asset
      }
      if (Object.keys(assets).length === 0) return 'bad install.assets'
      return { method: 'github-release', repo: raw.repo, assets, format: 'gz' }
    }
    default:
      return 'unknown install.method'
  }
}

export function parseLanguageServer(raw: unknown): LanguageServerEntry | string {
  if (!isObject(raw)) return 'not an object'
  const { id, name, description, targets, languages, binary, args, versionArgs, ramEstimate, homepage } = raw
  if (typeof id !== 'string' || !ID_RE.test(id)) return 'bad id'
  if (!nonEmptyString(name)) return 'bad name'
  if (!nonEmptyString(description)) return 'bad description'
  const targetList = targets === undefined ? ['vide'] : stringList(targets, ID_RE, 8)
  if (!targetList) return 'bad targets'
  const languageList = stringList(languages, LANGUAGE_RE, 16)
  if (!languageList || languageList.length === 0) return 'bad languages'
  if (typeof binary !== 'string' || !BINARY_RE.test(binary)) return 'bad binary'
  const argList = args === undefined ? [] : stringList(args, ARG_RE, 16)
  if (!argList) return 'bad args'
  const versionArgList = versionArgs === undefined ? ['--version'] : stringList(versionArgs, ARG_RE, 4)
  if (!versionArgList) return 'bad versionArgs'
  const install = parseInstall(raw.install)
  if (typeof install === 'string') return install

  const entry: LanguageServerEntry = {
    id, name, description,
    targets: targetList,
    languages: languageList,
    binary,
    args: argList,
    versionArgs: versionArgList,
    install,
  }
  // Optional and display-only: a bad one is left out, never the entry.
  if (nonEmptyString(ramEstimate) && ramEstimate.length <= 80) entry.ramEstimate = ramEstimate
  if (typeof homepage === 'string' && homepage.startsWith('https://')) entry.homepage = homepage
  return entry
}

// Entry by entry: a bad or duplicate entry is dropped alone. Only entries that
// target vIDE are kept. A missing list is simply no language servers.
export function parseLanguageServers(raw: unknown, target = 'vide'): LanguageServerEntry[] {
  if (!Array.isArray(raw)) return []
  const out: LanguageServerEntry[] = []
  const seen = new Set<string>()
  for (const item of raw.slice(0, MAX_ENTRIES)) {
    const parsed = parseLanguageServer(item)
    const id = isObject(item) && typeof item.id === 'string' ? item.id : '?'
    if (typeof parsed === 'string') {
      console.warn('[store] dropped language server', id, parsed)
      continue
    }
    if (seen.has(parsed.id)) {
      console.warn('[store] dropped language server', parsed.id, 'duplicate id')
      continue
    }
    seen.add(parsed.id)
    if (parsed.targets.includes(target)) out.push(parsed)
  }
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  return out
}
