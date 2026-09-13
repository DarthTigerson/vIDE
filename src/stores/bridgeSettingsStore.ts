import { create } from 'zustand'

const KEYS = {
  endpoint:           'vide:bridge:endpoint',
  apiKey:             'vide:bridge:apiKey',
  modelId:            'vide:bridge:modelId',
  toolCallLimit:      'vide:bridge:toolCallLimit',
  agentModeOnLaunch:  'vide:bridge:agentModeOnLaunch',
}

function getString(key: string, def: string): string {
  try {
    return localStorage.getItem(key) ?? def
  } catch {
    return def
  }
}

function getNumber(key: string, def: number): number {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return def
    const n = Number(v)
    return isNaN(n) ? def : n
  } catch {
    return def
  }
}

function getBoolean(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return def
    return v === 'true'
  } catch {
    return def
  }
}

type StoredSettings = { endpoint: string; apiKey: string; modelId: string }

function saveToFile(settings: StoredSettings): void {
  try {
    window.api.bridgeSetSettings(settings).catch(() => {})
  } catch {}
}

interface BridgeSettingsStore {
  endpoint: string
  apiKey: string
  modelId: string
  toolCallLimit: number
  agentModeOnLaunch: boolean
  setEndpoint: (v: string) => void
  setApiKey: (v: string) => void
  setModelId: (v: string) => void
  setToolCallLimit: (v: number) => void
  setAgentModeOnLaunch: (v: boolean) => void
  init: () => Promise<void>
}

export const useBridgeSettingsStore = create<BridgeSettingsStore>((set, get) => ({
  endpoint:           getString(KEYS.endpoint, ''),
  apiKey:             getString(KEYS.apiKey, ''),
  modelId:            getString(KEYS.modelId, ''),
  toolCallLimit:      getNumber(KEYS.toolCallLimit, 0),
  agentModeOnLaunch:  getBoolean(KEYS.agentModeOnLaunch, false),

  init: async () => {
    try {
      const fromFile = await window.api.bridgeGetSettings()
      if (fromFile && (fromFile.endpoint || fromFile.apiKey || fromFile.modelId)) {
        set({ endpoint: fromFile.endpoint, apiKey: fromFile.apiKey, modelId: fromFile.modelId })
        localStorage.setItem(KEYS.endpoint, fromFile.endpoint)
        localStorage.setItem(KEYS.apiKey, fromFile.apiKey)
        localStorage.setItem(KEYS.modelId, fromFile.modelId)
      } else {
        // Migrate localStorage values to file if no file exists yet
        const { endpoint, apiKey, modelId } = get()
        if (endpoint || apiKey || modelId) {
          saveToFile({ endpoint, apiKey, modelId })
        }
      }
    } catch {}
  },

  setEndpoint: (v) => {
    try { localStorage.setItem(KEYS.endpoint, v) } catch {}
    const { apiKey, modelId } = get()
    saveToFile({ endpoint: v, apiKey, modelId })
    set({ endpoint: v })
  },
  setApiKey: (v) => {
    try { localStorage.setItem(KEYS.apiKey, v) } catch {}
    const { endpoint, modelId } = get()
    saveToFile({ endpoint, apiKey: v, modelId })
    set({ apiKey: v })
  },
  setModelId: (v) => {
    try { localStorage.setItem(KEYS.modelId, v) } catch {}
    const { endpoint, apiKey } = get()
    saveToFile({ endpoint, apiKey, modelId: v })
    set({ modelId: v })
  },
  setToolCallLimit: (v) => {
    try { localStorage.setItem(KEYS.toolCallLimit, String(v)) } catch {}
    set({ toolCallLimit: v })
  },
  setAgentModeOnLaunch: (v) => {
    try { localStorage.setItem(KEYS.agentModeOnLaunch, String(v)) } catch {}
    set({ agentModeOnLaunch: v })
  },
}))
