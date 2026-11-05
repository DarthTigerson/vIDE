// vCloak: reversible masking of company repository paths before Claude
// traffic leaves the machine. Shared between main process and renderer.

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
  // Company root, e.g. "acme-corp" (may contain "/")
  root: string
  // Paths under the root left visible ('all-except' mode)
  exceptions: string[]
  // Paths to hide with their decoys ('selective' mode)
  rules: VcloakRule[]
  // Also replace the root itself
  maskRoot: boolean
  // Mask workspace folders that hold company repos
  maskLocalFolders: boolean
  // Replace /Users/<name> with /Users/dev
  maskUsername: boolean
  // Absolute local folders whose sub-folder names are swapped for made-up
  // names, down to each project folder, e.g. "/Users/you/Documents"
  hiddenFolders: string[]
  // Optional decoy per hidden folder: the folder itself is shown as this
  // made-up absolute path, e.g. "/Users/you/Documents/acme-corp"
  hiddenDecoys: Record<string, string>
  // Refuse to start a Claude session when vCloak cannot protect it
  failClosed: boolean
}

export const DEFAULT_VCLOAK_CONFIG: VcloakConfig = {
  enabled: false,
  mode: 'all',
  root: '',
  exceptions: [],
  rules: [],
  maskRoot: false,
  maskLocalFolders: true,
  maskUsername: false,
  hiddenFolders: [],
  hiddenDecoys: {},
  failClosed: true,
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
