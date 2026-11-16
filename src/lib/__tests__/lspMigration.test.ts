import { describe, it, expect, vi } from 'vitest'
import { LSP_MIGRATED_KEY, migrateBuiltInServers } from '../lspMigration'
import type { RegistryState } from '@/types/api'

const entry = (id: string) => ({
  id, name: id, description: 'x', targets: ['vide'], languages: [id], binary: id, args: [], versionArgs: ['--version'],
  install: { method: 'npm' as const, packages: [id] },
})
const registry = (ids: string[]): RegistryState =>
  ({ status: 'ok', checkedAt: 1, fromCache: false, apps: [], languageServers: ids.map(entry) }) as RegistryState

function deps(keys: Record<string, string>, found: string[]) {
  return {
    readKey: (k: string) => keys[k] ?? null,
    writeKey: vi.fn((k: string, v: string) => { keys[k] = v }),
    adopt: vi.fn(async (id: string) => found.includes(id)),
  }
}

describe('migrateBuiltInServers', () => {
  it('adopts servers that were switched on and are present; never those switched off', async () => {
    const keys: Record<string, string> = { 'vide:lsp:enabled:go': 'true', 'vide:lsp:enabled:rust': 'true', 'vide:lsp:enabled:python': 'false' }
    const d = deps(keys, ['go', 'python'])
    expect(await migrateBuiltInServers(registry(['go', 'rust', 'python']), d)).toEqual(['go'])
    expect(d.adopt).toHaveBeenCalledTimes(2) // go and rust; python was off
    expect(JSON.parse(keys[LSP_MIGRATED_KEY])).toEqual(['python', 'go', 'rust'])
  })

  it('runs once per id: a second load does nothing', async () => {
    const keys = { 'vide:lsp:enabled:go': 'true' }
    await migrateBuiltInServers(registry(['go']), deps(keys, ['go']))
    const again = deps(keys, ['go'])
    expect(await migrateBuiltInServers(registry(['go']), again)).toEqual([])
    expect(again.adopt).not.toHaveBeenCalled()
  })

  it('waits for the catalog: nothing happens or is marked done until it lists the id', async () => {
    const keys: Record<string, string> = { 'vide:lsp:enabled:go': 'true' }
    const d = deps(keys, ['go'])
    expect(await migrateBuiltInServers({ status: 'error', message: 'offline' } as RegistryState, d)).toEqual([])
    expect(await migrateBuiltInServers(registry([]), d)).toEqual([])
    expect(keys[LSP_MIGRATED_KEY]).toBeUndefined()
    expect(await migrateBuiltInServers(registry(['go']), d)).toEqual(['go'])
  })
})
