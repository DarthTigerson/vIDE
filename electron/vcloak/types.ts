// vCloak: reversible masking of company repository paths before Claude
// traffic leaves the machine. Shared between main process and renderer.

export type VcloakHost = 'gitlab' | 'github' | 'other'

export interface VcloakRoot {
  // GitLab: group path, may contain "/". GitHub and others: owner, one segment
  path: string
  host: VcloakHost
}

export type VcloakHiddenDepth = 'one' | 'project' | 'all-keep-ext' | 'all'

export type VcloakMode = 'all' | 'all-except' | 'selective'

export interface VcloakRule {
  // Real path under the root, e.g. "acme-corp/platform/billing"
  real: string
  // Decoy sent instead, e.g. "acme-corp/zq7/kx2"
  decoy: string
}

export interface VcloakConfig {
  enabled: boolean
  mode: VcloakMode
  // Company roots, e.g. { path: "acme-corp", host: "gitlab" }
  roots: VcloakRoot[]
  // Paths under a root left visible ('all-except' mode)
  exceptions: string[]
  // Paths to hide with their decoys ('selective' mode)
  rules: VcloakRule[]
  // Also replace the root itself
  maskRoot: boolean
  // Mask workspace folders that hold company repos
  maskLocalFolders: boolean
  // Replace /Users/<name> with /Users/dev
  maskUsername: boolean
  // Also hide plain one-word repo and folder names that are not ordinary
  // English words (made-up project names); ordinary words stay visible
  hidePlainNames: boolean
  // Absolute local folders whose sub-folder names are swapped for made-up
  // names, down to each project folder, e.g. "/Users/you/Documents"
  hiddenFolders: string[]
  // Optional decoy per hidden folder: the folder itself is shown as this
  // made-up absolute path, e.g. "/Users/you/Documents/acme-corp"
  hiddenDecoys: Record<string, string>
  // How deep names under a hidden folder are hidden: the folder and one
  // level below, down to each project folder, every name keeping file
  // extensions, or every name fully
  hiddenDepth: VcloakHiddenDepth
  // Refuse to start a Claude session when vCloak cannot protect it
  failClosed: boolean
  // Also protect vIDE Bridge chats (any OpenAI-style endpoint)
  coverBridge: boolean
  // Route AI tools started in vIDE terminals through vCloak (Claude, OpenAI
  // SDK based tools, Gemini CLI with Google login)
  coverTerminals: boolean
  // Codex CLI in vIDE terminals (API-key login)
  coverCodex: boolean
}

export const DEFAULT_VCLOAK_CONFIG: VcloakConfig = {
  enabled: false,
  mode: 'all',
  roots: [],
  exceptions: [],
  rules: [],
  maskRoot: false,
  maskLocalFolders: true,
  maskUsername: false,
  hidePlainNames: true,
  hiddenFolders: [],
  hiddenDecoys: {},
  hiddenDepth: 'one',
  failClosed: true,
  coverBridge: true,
  coverTerminals: true,
  coverCodex: true,
}

export interface VcloakSourcesState {
  graphify: { found: boolean; repos: number; builtAt: number | null }
  ripgrep: { repos: number }
  // Company repos known across all scanned workspaces
  repos: number
  scannedAt: number | null
  workspaces: string[]
}

export interface VcloakState {
  config: VcloakConfig
  gateway: { running: boolean; port: number | null; error: string | null }
  encryptionAvailable: boolean
  stats: { requests: number; masked: number; blocked: number }
  aliasCount: number
  // Per hidden folder: can vCloak list it (macOS privacy rules can block
  // that), and how many names it holds
  hiddenStatus?: { path: string; listed: boolean; count: number }[]
  sources: VcloakSourcesState
}

// One row of the Cloaked Repos table
export interface VcloakRepoRow {
  // Group path, e.g. "acme-corp/platform/billing/payments/invoice-api"
  remote: string
  // Absolute local folder, null when not cloned
  local: string | null
  // Masked group path, null when shown as is
  alias: string | null
  cloaked: boolean
}

export type VcloakSetConfigResult = { ok: true; state: VcloakState } | { ok: false; error: string }

export interface VcloakPreviewResult {
  masked: string
  // masked text run back through unmask; equals the input when reversible
  restored: string
}
