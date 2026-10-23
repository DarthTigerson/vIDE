import { describe, it, expect, vi } from 'vitest'

vi.hoisted(() => {
  const store: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
  }
})
import { MOVABLE_APP_IDS } from '../appFavorites'
import { APP_SETTINGS_PATHS, appDisabler } from '../appSettings'
import { SETTINGS_PAGES } from '@/components/Search/pageCommands'
import { useDockerSettingsStore } from '@/stores/dockerSettingsStore'

describe('appSettings', () => {
  it('points every app at an existing settings page', () => {
    const pages = new Set(SETTINGS_PAGES.map((p) => p.path))
    for (const id of MOVABLE_APP_IDS) expect(pages.has(APP_SETTINGS_PATHS[id])).toBe(true)
  })

  it('has a disabler for every app except the GitHub/GitLab one', () => {
    for (const id of MOVABLE_APP_IDS) expect(appDisabler(id) === null).toBe(id === 'git-remote')
  })

  it("turns the app's Enable switch off", () => {
    useDockerSettingsStore.getState().setEnabled(true)
    appDisabler('docker')!()
    expect(useDockerSettingsStore.getState().enabled).toBe(false)
  })
})
