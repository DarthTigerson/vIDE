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

import { useJiraSettingsStore } from '../jiraSettingsStore'

describe('jiraSettingsStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    useJiraSettingsStore.setState({ externalUrl: '', projectUrls: {}, closeSidePanelOnOpen: false, enabled: true })
  })

  it('defaults to an empty URL', () => {
    expect(useJiraSettingsStore.getState().externalUrl).toBe('')
  })

  it('setExternalUrl updates state and persists to localStorage', () => {
    useJiraSettingsStore.getState().setExternalUrl('https://team.atlassian.net/jira/board')
    expect(useJiraSettingsStore.getState().externalUrl).toBe('https://team.atlassian.net/jira/board')
    expect(localStorageStore['vide:jira:externalUrl']).toBe('https://team.atlassian.net/jira/board')
  })

  it('getEffectiveUrl falls back to the global URL when no project override is set', () => {
    useJiraSettingsStore.getState().setExternalUrl('https://team.atlassian.net/jira/board')
    expect(useJiraSettingsStore.getState().getEffectiveUrl('/repo/a')).toBe('https://team.atlassian.net/jira/board')
  })

  it('setProjectUrl overrides the global URL for that project only', () => {
    useJiraSettingsStore.getState().setExternalUrl('https://team.atlassian.net/jira/board')
    useJiraSettingsStore.getState().setProjectUrl('/repo/a', 'https://other-team.atlassian.net/jira/board')
    expect(useJiraSettingsStore.getState().getEffectiveUrl('/repo/a')).toBe('https://other-team.atlassian.net/jira/board')
    expect(useJiraSettingsStore.getState().getEffectiveUrl('/repo/b')).toBe('https://team.atlassian.net/jira/board')
    expect(localStorageStore['vide:jira:projectUrls']).toBe(JSON.stringify({ '/repo/a': 'https://other-team.atlassian.net/jira/board' }))
  })

  it('setProjectUrl with an empty value clears the override, falling back to global again', () => {
    useJiraSettingsStore.getState().setExternalUrl('https://team.atlassian.net/jira/board')
    useJiraSettingsStore.getState().setProjectUrl('/repo/a', 'https://other-team.atlassian.net/jira/board')
    useJiraSettingsStore.getState().setProjectUrl('/repo/a', '')
    expect(useJiraSettingsStore.getState().getEffectiveUrl('/repo/a')).toBe('https://team.atlassian.net/jira/board')
    expect(useJiraSettingsStore.getState().projectUrls).toEqual({})
  })

  it('defaults closeSidePanelOnOpen to false', () => {
    expect(useJiraSettingsStore.getState().closeSidePanelOnOpen).toBe(false)
  })

  it('setCloseSidePanelOnOpen updates state and persists to localStorage', () => {
    useJiraSettingsStore.getState().setCloseSidePanelOnOpen(true)
    expect(useJiraSettingsStore.getState().closeSidePanelOnOpen).toBe(true)
    expect(localStorageStore['vide:jira:closeSidePanel']).toBe('true')
  })

  it('defaults enabled to true', () => {
    expect(useJiraSettingsStore.getState().enabled).toBe(true)
  })

  it('setEnabled updates state and persists to localStorage', () => {
    useJiraSettingsStore.getState().setEnabled(false)
    expect(useJiraSettingsStore.getState().enabled).toBe(false)
    expect(localStorageStore['vide:jira:enabled']).toBe('false')
  })
})
