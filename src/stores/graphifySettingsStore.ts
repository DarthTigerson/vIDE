import { create } from 'zustand'

const ENABLED_KEY = 'vide:graphify:enabled'
const AUTO_BUILD_ON_OPEN_KEY = 'vide:graphify:autoBuildOnOpen'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface GraphifySettingsStore {
  enabled: boolean
  setEnabled: (value: boolean) => void
  // Off by default (VIDE-27): building a graph spawns a real CLI process and
  // can take a while on a large repo, so it shouldn't fire silently in the
  // background for every repo someone opens unless they've opted in.
  autoBuildOnOpen: boolean
  setAutoBuildOnOpen: (value: boolean) => void
}

export const useGraphifySettingsStore = create<GraphifySettingsStore>((set) => ({
  enabled: getBool(ENABLED_KEY, true),

  setEnabled: (value) => {
    localStorage.setItem(ENABLED_KEY, String(value))
    set({ enabled: value })
  },

  autoBuildOnOpen: getBool(AUTO_BUILD_ON_OPEN_KEY, false),

  setAutoBuildOnOpen: (value) => {
    localStorage.setItem(AUTO_BUILD_ON_OPEN_KEY, String(value))
    set({ autoBuildOnOpen: value })
  },
}))
