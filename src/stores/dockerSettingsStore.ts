import { create } from 'zustand'

const ENABLED_KEY = 'vide:docker:enabled'
const SHOW_BADGE_KEY = 'vide:docker:showBadge'
const BADGE_MODE_KEY = 'vide:docker:badgeMode'
const SHOW_MEMORY_KEY = 'vide:docker:showMemory'
const MEMORY_FORMAT_KEY = 'vide:docker:memoryFormat'

// What the activity-bar badge counts: every running container ("pods"),
// or the number of distinct Compose projects with at least one running
// container. Standalone (non-Compose) containers have no project, so they
// don't contribute to the 'projects' count.
export type DockerBadgeMode = 'containers' | 'projects'

// How each container row's memory usage is displayed.
export type DockerMemoryFormat = 'usedPercent' | 'availablePercent' | 'usedAbsolute' | 'usedOverLimit'

const MEMORY_FORMATS: DockerMemoryFormat[] = ['usedPercent', 'availablePercent', 'usedAbsolute', 'usedOverLimit']

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

function getBadgeMode(key: string, def: DockerBadgeMode): DockerBadgeMode {
  const value = localStorage.getItem(key)
  return value === 'containers' || value === 'projects' ? value : def
}

function getMemoryFormat(key: string, def: DockerMemoryFormat): DockerMemoryFormat {
  const value = localStorage.getItem(key)
  return (MEMORY_FORMATS as string[]).includes(value ?? '') ? (value as DockerMemoryFormat) : def
}

interface DockerSettingsStore {
  enabled: boolean
  setEnabled: (value: boolean) => void
  showBadge: boolean
  setShowBadge: (value: boolean) => void
  badgeMode: DockerBadgeMode
  setBadgeMode: (value: DockerBadgeMode) => void
  // Off by default — unlike the badge (which reuses the container list the
  // panel already fetches), memory display needs its own `docker stats`
  // poll, a noticeably heavier command, so it's opt-in rather than free.
  showMemory: boolean
  setShowMemory: (value: boolean) => void
  memoryFormat: DockerMemoryFormat
  setMemoryFormat: (value: DockerMemoryFormat) => void
}

export const useDockerSettingsStore = create<DockerSettingsStore>((set) => ({
  enabled: getBool(ENABLED_KEY, false),
  showBadge: getBool(SHOW_BADGE_KEY, true),
  badgeMode: getBadgeMode(BADGE_MODE_KEY, 'containers'),
  showMemory: getBool(SHOW_MEMORY_KEY, false),
  memoryFormat: getMemoryFormat(MEMORY_FORMAT_KEY, 'usedPercent'),

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
  setShowMemory: (value) => {
    localStorage.setItem(SHOW_MEMORY_KEY, String(value))
    set({ showMemory: value })
  },
  setMemoryFormat: (value) => {
    localStorage.setItem(MEMORY_FORMAT_KEY, value)
    set({ memoryFormat: value })
  },
}))
