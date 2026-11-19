import { describe, it, expect, beforeEach } from 'vitest'
import { migrateGitRemoteSettings } from '../gitpageMigration'
import { CATEGORY_PREFIXES } from '@/stores/configRepoStore'

const OLD = 'vide:gitRemote:closeSidePanel'
const NEW = 'vide:gitpage:closeSidePanel'

function memStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init))
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
    dump: () => Object.fromEntries(m),
  }
}

describe('migrateGitRemoteSettings', () => {
  let store: ReturnType<typeof memStore>
  beforeEach(() => { store = memStore() })

  it('carries the old close-side-panel setting to the Git Page app and drops the old key', () => {
    store = memStore({ [OLD]: 'true' })
    migrateGitRemoteSettings(store)
    expect(store.dump()).toEqual({ [NEW]: 'true' })
  })
  it('never overwrites a value the app already has', () => {
    store = memStore({ [OLD]: 'true', [NEW]: 'false' })
    migrateGitRemoteSettings(store)
    expect(store.dump()).toEqual({ [NEW]: 'false' })
  })
  it('is a no-op with nothing to migrate, and on a second run', () => {
    migrateGitRemoteSettings(store)
    expect(store.dump()).toEqual({})
    store = memStore({ [OLD]: 'true' })
    migrateGitRemoteSettings(store)
    migrateGitRemoteSettings(store)
    expect(store.dump()).toEqual({ [NEW]: 'true' })
  })
  it('syncs the app key with the git category, not the old prefix', () => {
    expect(CATEGORY_PREFIXES.git).toContain('vide:gitpage:')
    expect(CATEGORY_PREFIXES.git).not.toContain('vide:gitRemote:')
  })
})
