import { create } from 'zustand'
import type { AssistantKind } from '@/types/api'

const STORAGE_KEY = 'vide:enabledModels'
const ALL_MODELS: AssistantKind[] = ['claude', 'bridge']
const DEFAULT_ENABLED: Record<AssistantKind, boolean> = { claude: true, bridge: false }

function loadEnabled(): Record<AssistantKind, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_ENABLED }
    const parsed = JSON.parse(raw)
    // Only accept keys that are still valid AssistantKinds — drop stale
    // entries (e.g. a leftover "codex" key from before that assistant was
    // removed) rather than spreading the raw JSON verbatim.
    const merged = { ...DEFAULT_ENABLED }
    for (const model of ALL_MODELS) {
      if (typeof parsed[model] === 'boolean') merged[model] = parsed[model]
    }
    // Guard against every model ending up disabled (e.g. the surviving
    // state was `{claude:false, bridge:false}` after a stale key was
    // dropped) — the assistant picker must never be empty.
    if (!ALL_MODELS.some((m) => merged[m])) merged.claude = true
    return merged
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
