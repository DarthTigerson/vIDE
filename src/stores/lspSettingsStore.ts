import { create } from 'zustand'

export type LspServerId = 'typescript' | 'python' | 'go' | 'rust' | 'yaml' | 'json'

export const LSP_SERVER_IDS: LspServerId[] = ['go', 'json', 'python', 'rust', 'typescript', 'yaml']

const KEY_PREFIX = 'vide:lsp:enabled:'
const HOVER_KEY = 'vide:lsp:hover'
const COMPLETION_KEY = 'vide:lsp:completion'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface LspSettingsStore {
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
  // Off by default — spawning a language server has a real RAM cost, so
  // enabling one per language is an opt-in the user makes deliberately from
  // Settings > Editor rather than something that turns on for free.
  enabled: Object.fromEntries(LSP_SERVER_IDS.map((id) => [id, getBool(KEY_PREFIX + id, false)])) as Record<
    LspServerId,
    boolean
  >,

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
