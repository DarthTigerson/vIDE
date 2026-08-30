import { create } from 'zustand'

const ENABLED_KEY = 'vide:browser:mcpEnabled'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface BrowserMcpStore {
  enabled: boolean
  pending: boolean
  error: string | null
  setEnabled: (value: boolean) => Promise<void>
}

export const useBrowserMcpStore = create<BrowserMcpStore>((set) => ({
  enabled: getBool(ENABLED_KEY, false),
  pending: false,
  error: null,

  setEnabled: async (value) => {
    set({ pending: true, error: null })
    try {
      if (value) await window.api.browserMcpEnable()
      else await window.api.browserMcpDisable()
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
  const { enabled } = useBrowserMcpStore.getState()
  if (enabled) window.api.browserMcpEnable().catch(() => {})
  else window.api.browserMcpDisable().catch(() => {})
})
