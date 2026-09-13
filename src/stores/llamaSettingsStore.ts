import { create } from 'zustand'

const ENABLED_KEY = 'vide:llama:enabled'
const AGENT_MODE_ON_LAUNCH_KEY = 'vide:llama:agentModeOnLaunch'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface LlamaSettingsStore {
  enabled: boolean
  agentModeOnLaunch: boolean
  setEnabled: (value: boolean) => void
  setAgentModeOnLaunch: (value: boolean) => void
}

export const useLlamaSettingsStore = create<LlamaSettingsStore>((set) => ({
  enabled: getBool(ENABLED_KEY, true),
  agentModeOnLaunch: getBool(AGENT_MODE_ON_LAUNCH_KEY, false),

  setEnabled: (value) => {
    localStorage.setItem(ENABLED_KEY, String(value))
    set({ enabled: value })
  },
  setAgentModeOnLaunch: (value) => {
    localStorage.setItem(AGENT_MODE_ON_LAUNCH_KEY, String(value))
    set({ agentModeOnLaunch: value })
  },
}))
