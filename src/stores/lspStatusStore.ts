import { create } from 'zustand'
import type { InstalledServerInfo } from '@/types/api'
import { useLspSettingsStore, type LspServerId } from './lspSettingsStore'

// Language servers installed from the Store on this machine (main process:
// electron/lsp/installed.ts), plus the live state of any install or
// uninstall started from this window.
interface LspStatusStore {
  installed: InstalledServerInfo[]
  loaded: boolean
  installing: Partial<Record<LspServerId, boolean>>
  installOutput: Partial<Record<LspServerId, string>>
  installFailed: Partial<Record<LspServerId, boolean>>
  refresh: () => Promise<void>
  install: (id: LspServerId) => Promise<boolean>
  uninstall: (id: LspServerId) => Promise<void>
}

export const useLspStatusStore = create<LspStatusStore>((set) => ({
  installed: [],
  loaded: false,
  installing: {},
  installOutput: {},
  installFailed: {},

  refresh: async () => {
    const installed = await window.api.lspListInstalled()
    set({ installed, loaded: true })
  },

  install: async (id) => {
    subscribeLspEvents()
    set((s) => ({
      installing: { ...s.installing, [id]: true },
      installOutput: { ...s.installOutput, [id]: '' },
      installFailed: { ...s.installFailed, [id]: false },
    }))
    let ok = false
    try {
      ok = await window.api.lspInstall(id)
    } catch {
      ok = false
    }
    set((s) => ({ installing: { ...s.installing, [id]: false }, installFailed: { ...s.installFailed, [id]: !ok } }))
    // Installing is the opt-in: clear an old "off" left from the built-in days.
    if (ok) useLspSettingsStore.getState().setEnabled(id, true)
    return ok
  },

  uninstall: async (id) => {
    await window.api.lspUninstall(id)
    set((s) => ({ installOutput: { ...s.installOutput, [id]: '' } }))
  },
}))

export function isInstalled(installed: InstalledServerInfo[], id: LspServerId): boolean {
  return installed.some((i) => i.entry.id === id)
}

let subscribed = false

// Streamed install output, and the list reloading whenever any window
// installs or removes a server. Subscribes once per window.
export function subscribeLspEvents(): void {
  if (subscribed || typeof window.api?.onLspChanged !== 'function') return
  subscribed = true
  window.api.onLspInstallData((id, chunk) => {
    useLspStatusStore.setState((s) => ({
      installOutput: { ...s.installOutput, [id]: (s.installOutput[id] ?? '') + chunk },
    }))
  })
  window.api.onLspChanged(() => { void useLspStatusStore.getState().refresh() })
}
