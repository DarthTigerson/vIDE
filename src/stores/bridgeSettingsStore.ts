import { create } from 'zustand'

const KEYS = {
  endpoint: 'vide:bridge:endpoint',
  apiKey:   'vide:bridge:apiKey',
  modelId:  'vide:bridge:modelId',
}

function getString(key: string, def: string): string {
  try {
    return localStorage.getItem(key) ?? def
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
  setEndpoint: (v: string) => void
  setApiKey: (v: string) => void
  setModelId: (v: string) => void
  init: () => Promise<void>
}

export const useBridgeSettingsStore = create<BridgeSettingsStore>((set, get) => ({
  endpoint: getString(KEYS.endpoint, ''),
  apiKey:   getString(KEYS.apiKey, ''),
  modelId:  getString(KEYS.modelId, ''),

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
}))
