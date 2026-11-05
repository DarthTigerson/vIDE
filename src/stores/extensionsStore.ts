import { create } from 'zustand'
import { EXTENSIONS, type ExtensionId } from '@/lib/extensions'
import { notifySettingChanged } from '@/lib/notifySettingChanged'

// Under vide:general: so vIDE Sync carries them with the general category.
const enabledKey = (id: ExtensionId) => `vide:general:extension:${id}:enabled`

function loadEnabled(id: ExtensionId): boolean {
  try {
    const value = localStorage.getItem(enabledKey(id))
    return value === null ? true : value === 'true'
  } catch {
    return true
  }
}

interface ExtensionsStore {
  enabled: Record<ExtensionId, boolean>
  isEnabled: (id: ExtensionId) => boolean
  setEnabled: (id: ExtensionId, on: boolean) => void
}

export const useExtensionsStore = create<ExtensionsStore>((set, get) => ({
  enabled: Object.fromEntries(EXTENSIONS.map((e) => [e.id, loadEnabled(e.id)])) as Record<ExtensionId, boolean>,
  isEnabled: (id) => get().enabled[id],
  setEnabled: (id, on) => {
    try { localStorage.setItem(enabledKey(id), String(on)) } catch {}
    set((s) => ({ enabled: { ...s.enabled, [id]: on } }))
    notifySettingChanged()
  },
}))
