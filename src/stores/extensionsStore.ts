import { create } from 'zustand'
import { EXTENSIONS, type ExtensionId } from '@/lib/extensions'
import { notifySettingChanged } from '@/lib/notifySettingChanged'

// How an SVG opens: rendered only, rendered with a button to flip to the XML
// source and back, or rendered beside the source.
export type SvgMode = 'preview' | 'toggle' | 'split'
export const SVG_MODES: SvgMode[] = ['preview', 'toggle', 'split']

// Under vide:general: so vIDE Sync carries them with the general category.
const enabledKey = (id: ExtensionId) => `vide:general:extension:${id}:enabled`
const SVG_DEFAULT_MODE_KEY = 'vide:general:svgDefaultMode'

function loadEnabled(id: ExtensionId): boolean {
  try {
    const value = localStorage.getItem(enabledKey(id))
    return value === null ? true : value === 'true'
  } catch {
    return true
  }
}

function loadSvgDefaultMode(): SvgMode {
  try {
    const value = localStorage.getItem(SVG_DEFAULT_MODE_KEY)
    return SVG_MODES.includes(value as SvgMode) ? (value as SvgMode) : 'toggle'
  } catch {
    return 'toggle'
  }
}

interface ExtensionsStore {
  enabled: Record<ExtensionId, boolean>
  isEnabled: (id: ExtensionId) => boolean
  setEnabled: (id: ExtensionId, on: boolean) => void
  svgDefaultMode: SvgMode
  setSvgDefaultMode: (mode: SvgMode) => void
  // Per-file mode of an open SVG, in memory only; a file with no entry uses
  // the default.
  svgModes: Record<string, SvgMode>
  svgModeFor: (filePath: string) => SvgMode
  setSvgMode: (filePath: string, mode: SvgMode) => void
}

export const useExtensionsStore = create<ExtensionsStore>((set, get) => ({
  enabled: Object.fromEntries(EXTENSIONS.map((e) => [e.id, loadEnabled(e.id)])) as Record<ExtensionId, boolean>,
  isEnabled: (id) => get().enabled[id],
  setEnabled: (id, on) => {
    try { localStorage.setItem(enabledKey(id), String(on)) } catch {}
    set((s) => ({ enabled: { ...s.enabled, [id]: on } }))
    notifySettingChanged()
  },
  svgDefaultMode: loadSvgDefaultMode(),
  setSvgDefaultMode: (mode) => {
    try { localStorage.setItem(SVG_DEFAULT_MODE_KEY, mode) } catch {}
    set({ svgDefaultMode: mode })
    notifySettingChanged()
  },
  svgModes: {},
  svgModeFor: (filePath) => get().svgModes[filePath] ?? get().svgDefaultMode,
  setSvgMode: (filePath, mode) => set((s) => ({ svgModes: { ...s.svgModes, [filePath]: mode } })),
}))
