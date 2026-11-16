import type { RegistryState } from '@/types/api'

// Language servers used to be built in, switched on per language in
// Settings > Editor. Now they come from the Store. So nobody loses
// go-to-definition on upgrade: once per machine, every built-in server whose
// old switch was on and whose binary is already here gets recorded as
// installed from its catalog entry (main checks the binary; nothing is run).
// A switch that was on with no binary was not working before, so it gets
// nothing. Spec: docs/superpowers/specs/2026-11-16-language-servers-store-design.md

export const BUILT_IN_LSP_IDS = ['typescript', 'python', 'go', 'rust', 'yaml', 'json'] as const

// Per machine (outside every synced prefix): ids already looked at.
export const LSP_MIGRATED_KEY = 'vide:storeLsp:migrated'

interface MigrationDeps {
  readKey: (key: string) => string | null
  writeKey: (key: string, value: string) => void
  adopt: (id: string) => Promise<boolean>
}

function readDone(deps: MigrationDeps): string[] {
  try {
    const raw = JSON.parse(deps.readKey(LSP_MIGRATED_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

// Returns the ids it recorded as installed. An id is only marked done once the
// catalog listed it, so a catalog that fails to load just retries next launch.
export async function migrateBuiltInServers(registry: RegistryState | null, deps: MigrationDeps): Promise<string[]> {
  if (registry?.status !== 'ok') return []
  const done = readDone(deps)
  const listed = new Set(registry.languageServers.map((l) => l.id))
  const todo = BUILT_IN_LSP_IDS.filter((id) => listed.has(id) && !done.includes(id))
  if (todo.length === 0) return []
  const adopted: string[] = []
  for (const id of todo) {
    if (deps.readKey(`vide:lsp:enabled:${id}`) === 'true' && (await deps.adopt(id).catch(() => false))) adopted.push(id)
  }
  deps.writeKey(LSP_MIGRATED_KEY, JSON.stringify([...done, ...todo]))
  return adopted
}

let running = false

// Browser-side wiring: localStorage plus the lsp:adopt IPC. Safe to call on
// every catalog load; it does nothing once every built-in id was looked at.
export function runLspMigration(registry: RegistryState | null): void {
  if (running || typeof window.api?.lspAdopt !== 'function') return
  running = true
  void migrateBuiltInServers(registry, {
    readKey: (k) => { try { return localStorage.getItem(k) } catch { return null } },
    writeKey: (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
    adopt: (id) => window.api.lspAdopt(id),
  }).finally(() => { running = false })
}
