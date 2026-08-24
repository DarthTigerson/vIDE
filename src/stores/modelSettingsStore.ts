import { create } from 'zustand'
import type { AssistantKind } from '@/types/api'

const STORAGE_KEY = 'vide:enabledModels'
const ALL_MODELS: AssistantKind[] = ['claude', 'codex', 'bridge']
const DEFAULT_ENABLED: Record<AssistantKind, boolean> = { claude: true, codex: false, bridge: false }

function loadEnabled(): Record<AssistantKind, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_ENABLED }
    return { ...DEFAULT_ENABLED, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_ENABLED }
  }
}

interface ModelSettingsStore {
  enabled: Record<AssistantKind, boolean>
  setEnabled: (id: AssistantKind, value: boolean) => void
}

export const useModelSettingsStore = create<ModelSettingsStore>((set, get) => ({
  enabled: loadEnabled(),

  setEnabled: (id, value) => {
    const current = get().enabled
    // Keep at least one model enabled — disabling the last one would leave
    // the assistant picker (top-right dropdown) with nothing to select.
    const enabledCount = ALL_MODELS.filter((m) => current[m]).length
    if (!value && current[id] && enabledCount <= 1) return

    const next = { ...current, [id]: value }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {}
    set({ enabled: next })
  },
}))
