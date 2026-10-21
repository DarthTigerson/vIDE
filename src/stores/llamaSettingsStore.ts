import { create } from 'zustand'

const ENABLED_KEY = 'vide:llama:enabled'
const AGENT_MODE_ON_LAUNCH_KEY = 'vide:llama:agentModeOnLaunch'
const TOOL_CALL_LIMIT_KEY = 'vide:llama:toolCallLimit'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

function getNumber(key: string, def: number): number {
  const value = localStorage.getItem(key)
  const n = Number(value)
  return value === null || isNaN(n) ? def : n
}

interface LlamaSettingsStore {
  enabled: boolean
  agentModeOnLaunch: boolean
  toolCallLimit: number // 0 = unlimited
  setEnabled: (value: boolean) => void
  setAgentModeOnLaunch: (value: boolean) => void
  setToolCallLimit: (value: number) => void
}

export const useLlamaSettingsStore = create<LlamaSettingsStore>((set) => ({
  enabled: getBool(ENABLED_KEY, true),
  agentModeOnLaunch: getBool(AGENT_MODE_ON_LAUNCH_KEY, false),
  toolCallLimit: getNumber(TOOL_CALL_LIMIT_KEY, 0),

  setEnabled: (value) => {
    localStorage.setItem(ENABLED_KEY, String(value))
    set({ enabled: value })
  },
  setAgentModeOnLaunch: (value) => {
    localStorage.setItem(AGENT_MODE_ON_LAUNCH_KEY, String(value))
    set({ agentModeOnLaunch: value })
  },
  setToolCallLimit: (value) => {
    localStorage.setItem(TOOL_CALL_LIMIT_KEY, String(value))
    set({ toolCallLimit: value })
  },
}))
