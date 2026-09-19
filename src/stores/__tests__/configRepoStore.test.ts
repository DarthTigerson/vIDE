import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { api } = vi.hoisted(() => ({
  api: {
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
  },
}))

import { useConfigRepoStore } from '../configRepoStore'

const ALL_CATS = {
  general: true, models: true, git: true, docker: true,
  integrations: true, notes: true, todo: true, jira: true,
}

describe('configRepoStore — connect flow (SYNC-12)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as any).window = { api }
    useConfigRepoStore.setState({
      enabled: false,
      repoUrl: 'https://github.com/you/vide-config.git',
      token: 'tok',
      categories: { ...ALL_CATS },
      status: 'idle',
      lastSyncAt: null,
      errorMessage: null,
    })
  })
  afterEach(() => {
    useConfigRepoStore.setState({ status: 'idle', enabled: false, errorMessage: null, lastSyncAt: null })
  })

  it('goes idle → connecting → connected and enables sync on success', async () => {
    let resolveConnect!: () => void
    api.configRepoConnect.mockImplementationOnce(
      () => new Promise<void>((r) => { resolveConnect = r }),
    )
    const p = useConfigRepoStore.getState().connect()
    expect(useConfigRepoStore.getState().status).toBe('connecting')
    resolveConnect()
    await p
    expect(useConfigRepoStore.getState().status).toBe('connected')
    expect(useConfigRepoStore.getState().enabled).toBe(true)
    expect(api.configRepoConnect).toHaveBeenCalledWith('https://github.com/you/vide-config.git', 'tok')
  })

  it('shows a red error state with the message when credentials are bad', async () => {
    api.configRepoConnect.mockRejectedValueOnce(new Error('Authentication failed'))
    await useConfigRepoStore.getState().connect()
    expect(useConfigRepoStore.getState().status).toBe('error')
    expect(useConfigRepoStore.getState().errorMessage).toBe('Authentication failed')
    expect(useConfigRepoStore.getState().enabled).toBe(false)
  })
})
