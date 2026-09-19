import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { api, storage } = vi.hoisted(() => {
  const map = new Map<string, string>()
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
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
    configRepoSetSettings: vi.fn(async () => {}),
    configRepoConnect: vi.fn(async () => {}),
    configRepoPush: vi.fn(async () => {}),
    configRepoPull: vi.fn(async () => ({})),
  }
  ;(globalThis as any).window = { api, localStorage: storage }
  ;(globalThis as any).localStorage = storage
  return { api, storage }
})

import { useConfigRepoStore } from '../configRepoStore'
import { notifySettingChanged } from '../../lib/notifySettingChanged'

const ALL_CATS = {
  general: true, models: true, git: true, docker: true,
  integrations: true, notes: true, todo: true, jira: true,
}

function resetStore(overrides: Partial<{ enabled: boolean }> = {}) {
  useConfigRepoStore.setState({
    enabled: overrides.enabled ?? true,
    repoUrl: 'https://github.com/you/vide-config.git',
    token: 'tok',
    categories: { ...ALL_CATS },
    status: 'connected',
    lastSyncAt: null,
    errorMessage: null,
    loaded: true,
  })
}

// ─── SYNC-14 / SYNC-15 / SYNC-16 ────────────────────────────────────────────
// Theme, font-size, and display-settings stores all call notifySettingChanged()
// on every mutation. This suite verifies that the signal propagates to
// configRepoStore.schedulePush() and fires configRepoPush after the 2 s debounce.

describe('auto-push — notifySettingChanged → debounced configRepoPush (SYNC-14/15/16)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storage.clear()
    vi.useFakeTimers()
    resetStore()
  })
  afterEach(() => {
    vi.useRealTimers()
    useConfigRepoStore.setState({ enabled: false, status: 'idle' })
  })

  it('fires configRepoPush after the 2 s debounce when a setting changes', async () => {
    notifySettingChanged()
    expect(api.configRepoPush).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2001)
    expect(api.configRepoPush).toHaveBeenCalledTimes(1)
  })

  it('debounces — rapid consecutive changes coalesce into one push', async () => {
    notifySettingChanged()
    await vi.advanceTimersByTimeAsync(500)
    notifySettingChanged()
    await vi.advanceTimersByTimeAsync(500)
    notifySettingChanged()
    await vi.advanceTimersByTimeAsync(2001)
    expect(api.configRepoPush).toHaveBeenCalledTimes(1)
  })

  it('does not push when sync is disabled', async () => {
    resetStore({ enabled: false })
    notifySettingChanged()
    await vi.advanceTimersByTimeAsync(2001)
    expect(api.configRepoPush).not.toHaveBeenCalled()
  })
})

// ─── SYNC-17 ─────────────────────────────────────────────────────────────────
// The "Push Now" button in GeneralSettingsPage calls push() directly —
// no timer, immediate IPC call, lastSyncAt updated on success.

describe('push now — SYNC-17', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storage.clear()
    resetStore()
  })
  afterEach(() => {
    useConfigRepoStore.setState({ enabled: false, status: 'idle', lastSyncAt: null })
  })

  it('calls configRepoPush immediately and updates lastSyncAt on success', async () => {
    const before = Date.now()
    await useConfigRepoStore.getState().push()
    expect(api.configRepoPush).toHaveBeenCalledTimes(1)
    const { lastSyncAt, status } = useConfigRepoStore.getState()
    expect(lastSyncAt).not.toBeNull()
    expect(lastSyncAt!).toBeGreaterThanOrEqual(before)
    expect(status).toBe('connected')
  })

  it('sets status:error and stores the message when push fails', async () => {
    api.configRepoPush.mockRejectedValueOnce(new Error('network timeout'))
    await useConfigRepoStore.getState().push()
    expect(useConfigRepoStore.getState().status).toBe('error')
    expect(useConfigRepoStore.getState().errorMessage).toBe('network timeout')
  })
})

// ─── SYNC-20 ─────────────────────────────────────────────────────────────────
// Category toggle chips in GeneralSettingsPage disable individual categories.
// Disabled categories must be absent from the configRepoPush payload.

describe('category toggles — disabled category excluded from push (SYNC-20)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storage.clear()
    resetStore()
  })
  afterEach(() => {
    useConfigRepoStore.setState({ enabled: false, status: 'idle' })
  })

  it('excludes a disabled category from the push payload', async () => {
    storage.setItem('vide:theme', 'claude-dark')
    storage.setItem('vide:docker:enabled', 'true')

    useConfigRepoStore.setState({ categories: { ...ALL_CATS, docker: false } })
    await useConfigRepoStore.getState().push()

    const payload = api.configRepoPush.mock.calls[0][0] as Record<string, Record<string, string>>
    expect(payload.general?.['vide:theme']).toBe('claude-dark')
    expect(payload.docker).toBeUndefined()
  })

  it('includes a category again after it is re-enabled', async () => {
    storage.setItem('vide:docker:enabled', 'true')

    useConfigRepoStore.setState({ categories: { ...ALL_CATS, docker: false } })
    useConfigRepoStore.setState({ categories: { ...ALL_CATS, docker: true } })
    await useConfigRepoStore.getState().push()

    const payload = api.configRepoPush.mock.calls[0][0] as Record<string, Record<string, string>>
    expect(payload.docker?.['vide:docker:enabled']).toBe('true')
  })
})

// ─── SYNC-21 ─────────────────────────────────────────────────────────────────
// Bridge endpoint, API key, and enabled models all fall under the "models"
// category prefix and must be included in the push payload.

describe('models category — bridge and model keys synced (SYNC-21)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storage.clear()
    resetStore()
  })
  afterEach(() => {
    useConfigRepoStore.setState({ enabled: false, status: 'idle' })
  })

  it('includes bridge endpoint, API key, and enabledModels in models payload', async () => {
    storage.setItem('vide:bridge:endpoint', 'http://127.0.0.1:8080/v1')
    storage.setItem('vide:bridge:apiKey', 'sk-test')
    storage.setItem('vide:enabledModels', '["claude-opus-4-8"]')

    await useConfigRepoStore.getState().push()
    const payload = api.configRepoPush.mock.calls[0][0] as Record<string, Record<string, string>>
    expect(payload.models?.['vide:bridge:endpoint']).toBe('http://127.0.0.1:8080/v1')
    expect(payload.models?.['vide:bridge:apiKey']).toBe('sk-test')
    expect(payload.models?.['vide:enabledModels']).toBe('["claude-opus-4-8"]')
  })
})

// ─── SYNC-22 ─────────────────────────────────────────────────────────────────
// Cross-machine round-trip: Machine A pushes, Machine B restarts →
// preBootSync pulls the remote values and writes them to localStorage
// before any store module initialises.

describe('cross-machine round-trip — pull writes remote values to localStorage (SYNC-22)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storage.clear()
  })
  afterEach(() => {
    useConfigRepoStore.setState({ status: 'idle', enabled: false, lastSyncAt: null })
  })

  it('Machine B restart: remote settings land in localStorage before App loads', async () => {
    api.configRepoPull.mockResolvedValueOnce({
      general: { 'vide:theme': 'luuk-dark', 'vide:fontSize': '16' },
      models: { 'vide:bridge:endpoint': 'http://10.0.0.1:8080/v1' },
    })

    const { runPreMountSync, preMountSyncResult } = await import('../../lib/preBootSync')
    Object.assign(preMountSyncResult, { done: false, lastSyncAt: null })
    await runPreMountSync()

    expect(storage.getItem('vide:theme')).toBe('luuk-dark')
    expect(storage.getItem('vide:fontSize')).toBe('16')
    expect(storage.getItem('vide:bridge:endpoint')).toBe('http://10.0.0.1:8080/v1')
    expect(preMountSyncResult.done).toBe(true)
    expect(preMountSyncResult.lastSyncAt).not.toBeNull()
  })
})
