import { create } from 'zustand'
import {
  DEFAULT_AI_PRESET_VALUES,
  type AiBoardRule, type AiPresetValues, type AiRulesListId, type AiRulesToolId,
} from '../../electron/aiRulesPresets'

export type { AiBoardRule, AiRulesListId, AiRulesToolId }

type Lists = Record<AiRulesListId, string[]>

const EMPTY_LISTS: Lists = { general: [], todos: [], scripts: [], notes: [], browser: [], graphify: [] }

interface AiRulesSettingsStore {
  enabled: boolean
  presets: AiPresetValues
  boards: AiBoardRule[]
  lists: Lists
  initialized: boolean
  init: () => Promise<void>
  setEnabled: (value: boolean) => void
  setPreset: (tool: AiRulesToolId, id: string, value: boolean | string) => void
  setBoards: (boards: AiBoardRule[]) => void
  setList: (id: AiRulesListId, rules: string[]) => void
  resetList: (id: AiRulesListId) => Promise<void>
}

// Persisted on the main-process side (not localStorage): Claude sessions are
// spawned there, and read the rules fresh at every launch.
export const useAiRulesSettingsStore = create<AiRulesSettingsStore>((set, get) => {
  const save = (patch: Partial<Pick<AiRulesSettingsStore, 'enabled' | 'presets' | 'boards' | 'lists'>>) => {
    set(patch)
    const { enabled, presets, boards, lists } = get()
    void window.api.aiRulesSet({ enabled, presets, boards, lists })
  }

  return {
    enabled: true,
    presets: DEFAULT_AI_PRESET_VALUES,
    boards: [],
    lists: EMPTY_LISTS,
    initialized: false,

    init: async () => {
      if (get().initialized) return
      set({ initialized: true })
      set(await window.api.aiRulesGet())
    },

    setEnabled: (value) => save({ enabled: value }),
    setPreset: (tool, id, value) => {
      const presets = get().presets
      save({ presets: { ...presets, [tool]: { ...presets[tool], [id]: value } } })
    },
    setBoards: (boards) => save({ boards }),
    setList: (id, rules) => save({ lists: { ...get().lists, [id]: rules } }),
    resetList: async (id) => {
      const defaults = await window.api.aiRulesGetDefaults()
      save({ lists: { ...get().lists, [id]: defaults[id] } })
    },
  }
})
