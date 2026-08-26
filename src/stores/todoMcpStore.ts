import { create } from 'zustand'

const ENABLED_KEY = 'vide:todo:mcpEnabled'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface TodoMcpStore {
  enabled: boolean
  pending: boolean
  error: string | null
  setEnabled: (value: boolean) => Promise<void>
}

// Opt-in and false by default: this grants Claude Code read+write access to
// every todo across every board, so it shouldn't switch on silently.
export const useTodoMcpStore = create<TodoMcpStore>((set) => ({
  enabled: getBool(ENABLED_KEY, false),
  pending: false,
  error: null,

  setEnabled: async (value) => {
    set({ pending: true, error: null })
    try {
      if (value) await window.api.todosMcpEnable()
      else await window.api.todosMcpDisable()
      localStorage.setItem(ENABLED_KEY, String(value))
      set({ enabled: value, pending: false })
    } catch (err) {
      set({ pending: false, error: err instanceof Error ? err.message : String(err) })
    }
  },
}))
