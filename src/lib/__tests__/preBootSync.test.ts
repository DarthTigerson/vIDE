import { describe, it, expect, beforeEach, vi } from 'vitest'

// Node test env has no window/localStorage — install one up front so the
// bare `localStorage` calls inside preBootSync resolve to this store.
const { api, storage } = vi.hoisted(() => {
  const map = new Map<string, string>()
  const storage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => { map.clear() },
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size },
  }
  const api = {
    configRepoGetSettings: vi.fn(async () => ({
      enabled: true,
      repoUrl: 'https://github.com/you/vide-config.git',
      token: 'tok',
      categories: {
        general: true, models: true, git: true, docker: true,
        integrations: true, notes: true, todo: true, jira: true,
      },
    })),
    configRepoPull: vi.fn(async () => ({
      general: { 'vide:theme': 'borahae-dark', 'vide:fontSize': '15' },
      models: { 'vide:bridge:endpoint': 'http://127.0.0.1:8080/v1' },
    })),
  }
  ;(globalThis as any).window = { api, localStorage: storage }
  ;(globalThis as any).localStorage = storage
  return { api, storage }
})

import { runPreMountSync, preMountSyncResult } from '../preBootSync'

describe('preBootSync (SYNC-13)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storage.clear()
    Object.assign(preMountSyncResult, { done: false, lastSyncAt: null })
  })

  it('pulls remote settings and writes them to localStorage before App imports', async () => {
    await runPreMountSync()
    // The renderer stores read these keys at module-load time — main.tsx
    // awaits runPreMountSync() BEFORE the dynamic App import, so the values
    // must already be in localStorage (no flash of old theme).
    expect(storage.getItem('vide:theme')).toBe('borahae-dark')
    expect(storage.getItem('vide:fontSize')).toBe('15')
    expect(storage.getItem('vide:bridge:endpoint')).toBe('http://127.0.0.1:8080/v1')
    expect(preMountSyncResult).toEqual({ done: true, lastSyncAt: expect.any(Number) })
  })

  it('does not pull when sync is disabled', async () => {
    api.configRepoGetSettings.mockResolvedValueOnce({
      enabled: false,
      repoUrl: '',
      token: '',
      categories: {},
    })
    await runPreMountSync()
    expect(api.configRepoPull).not.toHaveBeenCalled()
    expect(storage.getItem('vide:theme')).toBeNull()
    expect(preMountSyncResult.done).toBe(true)
  })

  it('still completes (done=true) when the pull fails, so boot never hangs', async () => {
    api.configRepoPull.mockRejectedValueOnce(new Error('offline'))
    await runPreMountSync()
    expect(preMountSyncResult.done).toBe(true)
    expect(preMountSyncResult.lastSyncAt).toBeNull()
    expect(storage.getItem('vide:theme')).toBeNull()
  })
})
