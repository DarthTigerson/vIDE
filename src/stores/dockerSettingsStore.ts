import { create } from 'zustand'

const ENABLED_KEY = 'vide:docker:enabled'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface DockerSettingsStore {
  enabled: boolean
  setEnabled: (value: boolean) => void
}

export const useDockerSettingsStore = create<DockerSettingsStore>((set) => ({
  enabled: getBool(ENABLED_KEY, false),

  setEnabled: (value) => {
    localStorage.setItem(ENABLED_KEY, String(value))
    set({ enabled: value })
  },
}))
