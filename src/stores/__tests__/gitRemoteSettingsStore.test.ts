import { describe, it, expect, beforeEach, vi } from 'vitest'

const { localStorageStore } = vi.hoisted(() => {
  const localStorageStore: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
  }
  return { localStorageStore }
})

import { useGitRemoteSettingsStore } from '../gitRemoteSettingsStore'

describe('gitRemoteSettingsStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    useGitRemoteSettingsStore.setState({ externalUrl: '', projectUrls: {}, closeSidePanelOnOpen: false })
  })

  it('defaults to an empty URL', () => {
    expect(useGitRemoteSettingsStore.getState().externalUrl).toBe('')
  })

  it('setExternalUrl updates state and persists to localStorage', () => {
    useGitRemoteSettingsStore.getState().setExternalUrl('https://github.com/acme/widgets')
    expect(useGitRemoteSettingsStore.getState().externalUrl).toBe('https://github.com/acme/widgets')
    expect(localStorageStore['vide:gitRemote:externalUrl']).toBe('https://github.com/acme/widgets')
  })

  it('getEffectiveUrl falls back to the global URL when no project override is set', () => {
    useGitRemoteSettingsStore.getState().setExternalUrl('https://github.com/acme/widgets')
    expect(useGitRemoteSettingsStore.getState().getEffectiveUrl('/repo/a')).toBe('https://github.com/acme/widgets')
  })

  it('getEffectiveUrl falls back to the global URL when projectRoot is null', () => {
    useGitRemoteSettingsStore.getState().setExternalUrl('https://github.com/acme/widgets')
    expect(useGitRemoteSettingsStore.getState().getEffectiveUrl(null)).toBe('https://github.com/acme/widgets')
  })

  it('setProjectUrl overrides the global URL for that project only', () => {
    useGitRemoteSettingsStore.getState().setExternalUrl('https://github.com/acme/widgets')
    useGitRemoteSettingsStore.getState().setProjectUrl('/repo/a', 'https://gitlab.com/acme/widgets-fork')
    expect(useGitRemoteSettingsStore.getState().getEffectiveUrl('/repo/a')).toBe('https://gitlab.com/acme/widgets-fork')
    expect(useGitRemoteSettingsStore.getState().getEffectiveUrl('/repo/b')).toBe('https://github.com/acme/widgets')
    expect(localStorageStore['vide:gitRemote:projectUrls']).toBe(JSON.stringify({ '/repo/a': 'https://gitlab.com/acme/widgets-fork' }))
  })

  it('setProjectUrl with an empty value clears the override, falling back to global again', () => {
    useGitRemoteSettingsStore.getState().setExternalUrl('https://github.com/acme/widgets')
    useGitRemoteSettingsStore.getState().setProjectUrl('/repo/a', 'https://gitlab.com/acme/widgets-fork')
    useGitRemoteSettingsStore.getState().setProjectUrl('/repo/a', '')
    expect(useGitRemoteSettingsStore.getState().getEffectiveUrl('/repo/a')).toBe('https://github.com/acme/widgets')
    expect(useGitRemoteSettingsStore.getState().projectUrls).toEqual({})
  })

  it('defaults closeSidePanelOnOpen to false', () => {
    expect(useGitRemoteSettingsStore.getState().closeSidePanelOnOpen).toBe(false)
  })

  it('setCloseSidePanelOnOpen updates state and persists to localStorage', () => {
    useGitRemoteSettingsStore.getState().setCloseSidePanelOnOpen(true)
    expect(useGitRemoteSettingsStore.getState().closeSidePanelOnOpen).toBe(true)
    expect(localStorageStore['vide:gitRemote:closeSidePanel']).toBe('true')
  })
})
