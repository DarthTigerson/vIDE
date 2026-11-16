import { create } from 'zustand'

// Ids are Store catalog ids (e.g. 'typescript', 'go'); any installed one.
export type LspServerId = string

const KEY_PREFIX = 'vide:lsp:enabled:'
const HOVER_KEY = 'vide:lsp:hover'
const COMPLETION_KEY = 'vide:lsp:completion'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

// Installing a server from the Store is the opt-in, so an installed server
// is on unless the user switched it off (the key then exists as 'false').
// Synced under 'vide:lsp:', so the choice follows the user between machines.
export function isServerEnabled(id: LspServerId): boolean {
  return getBool(KEY_PREFIX + id, true)
}

interface LspSettingsStore {
  // Only ids the user toggled this session or that were read for display;
  // isServerEnabled() is the source of truth for anything else.
  enabled: Record<LspServerId, boolean>
  setEnabled: (id: LspServerId, value: boolean) => void
  // Global on/off for the two editor-wide features, layered on top of the
  // per-language `enabled` set: a language's server can be running (for
  // go-to-definition) while hover or completion are muted everywhere. Gated
  // purely in the renderer — when off, the provider just never asks the
  // server, so no IPC and the process keeps serving its other requests.
  hoverEnabled: boolean
  completionEnabled: boolean
  setHoverEnabled: (value: boolean) => void
  setCompletionEnabled: (value: boolean) => void
}

export const useLspSettingsStore = create<LspSettingsStore>((set, get) => ({
  enabled: {},

  setEnabled: (id, value) => {
    localStorage.setItem(KEY_PREFIX + id, String(value))
    set({ enabled: { ...get().enabled, [id]: value } })
    window.api.lspSetEnabled(id, value)
  },

  // On by default — once a user turns a server on, the expectation is the full
  // set of features; these let them pare it back without stopping the server.
  hoverEnabled: getBool(HOVER_KEY, true),
  completionEnabled: getBool(COMPLETION_KEY, true),

  setHoverEnabled: (value) => {
    localStorage.setItem(HOVER_KEY, String(value))
    set({ hoverEnabled: value })
  },

  setCompletionEnabled: (value) => {
    localStorage.setItem(COMPLETION_KEY, String(value))
    set({ completionEnabled: value })
  },
}))

export function useServerEnabled(id: LspServerId): boolean {
  return useLspSettingsStore((s) => s.enabled[id] ?? isServerEnabled(id))
}
