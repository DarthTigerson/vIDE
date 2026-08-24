import { create } from 'zustand'

export type LspServerId = 'typescript' | 'python' | 'go' | 'rust'

export const LSP_SERVER_IDS: LspServerId[] = ['go', 'python', 'rust', 'typescript']

const KEY_PREFIX = 'vide:lsp:enabled:'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

interface LspSettingsStore {
  enabled: Record<LspServerId, boolean>
  setEnabled: (id: LspServerId, value: boolean) => void
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
}))
