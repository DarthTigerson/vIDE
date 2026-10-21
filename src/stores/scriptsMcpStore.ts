import { create } from 'zustand'

const ENABLED_KEY = 'vide:scriptsMcp:enabled'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface ScriptsMcpStore {
  enabled: boolean
  pending: boolean
  error: string | null
  setEnabled: (value: boolean) => Promise<void>
}

export const useScriptsMcpStore = create<ScriptsMcpStore>((set) => ({
  enabled: getBool(ENABLED_KEY, true),
  pending: false,
  error: null,

  setEnabled: async (value) => {
    set({ pending: true, error: null })
    try {
      if (value) await window.api.scriptsMcpEnable()
      else await window.api.scriptsMcpDisable()
      localStorage.setItem(ENABLED_KEY, String(value))
      set({ enabled: value, pending: false })
    } catch (err) {
      set({ pending: false, error: err instanceof Error ? err.message : String(err) })
    }
  },
}))

// Sync Claude's user config with the stored toggle state on every app start.
// Prevents the MCP server from remaining registered across sessions when the
// toggle is off (e.g. after a crash or first-run before the user ever toggled).
Promise.resolve().then(() => {
  // Imported (via bridgeStore) by node-env tests too, where there's no preload API.
  if (typeof window === 'undefined' || !window.api) return
  const { enabled } = useScriptsMcpStore.getState()
  if (enabled) window.api.scriptsMcpEnable().catch(() => {})
  else window.api.scriptsMcpDisable().catch(() => {})
})
