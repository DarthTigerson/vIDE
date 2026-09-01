import { create } from 'zustand'

const ENABLED_KEY = 'vide:docker:enabled'
const SHOW_BADGE_KEY = 'vide:docker:showBadge'
const BADGE_MODE_KEY = 'vide:docker:badgeMode'

// What the activity-bar badge counts: every running container ("pods"),
// or the number of distinct Compose projects with at least one running
// container. Standalone (non-Compose) containers have no project, so they
// don't contribute to the 'projects' count.
export type DockerBadgeMode = 'containers' | 'projects'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

function getBadgeMode(key: string, def: DockerBadgeMode): DockerBadgeMode {
  const value = localStorage.getItem(key)
  return value === 'containers' || value === 'projects' ? value : def
}

interface DockerSettingsStore {
  enabled: boolean
  setEnabled: (value: boolean) => void
  showBadge: boolean
  setShowBadge: (value: boolean) => void
  badgeMode: DockerBadgeMode
  setBadgeMode: (value: DockerBadgeMode) => void
}

export const useDockerSettingsStore = create<DockerSettingsStore>((set) => ({
  enabled: getBool(ENABLED_KEY, false),
  showBadge: getBool(SHOW_BADGE_KEY, true),
  badgeMode: getBadgeMode(BADGE_MODE_KEY, 'containers'),

  setEnabled: (value) => {
    localStorage.setItem(ENABLED_KEY, String(value))
    set({ enabled: value })
  },
  setShowBadge: (value) => {
    localStorage.setItem(SHOW_BADGE_KEY, String(value))
    set({ showBadge: value })
  },
  setBadgeMode: (value) => {
    localStorage.setItem(BADGE_MODE_KEY, value)
    set({ badgeMode: value })
  },
}))
