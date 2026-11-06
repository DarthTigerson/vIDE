import { create } from 'zustand'
import { notifySettingChanged } from '../lib/notifySettingChanged'
import {
  applyGitChangeColors,
  DEFAULT_CUSTOM_CHANGE_COLORS,
  type ChangeColorMode,
  type ChangeColors,
  type ChangeStrength,
} from '../lib/gitChangeColors'

const KEYS = {
  autoSaveEnabled: 'vide:editor:autoSaveEnabled',
  wordWrapEnabled: 'vide:editor:wordWrapEnabled',
  markdownOpenMode: 'vide:editor:markdownOpenMode',
  // Git blame settings live on Settings > Git, so they use the vide:git: prefix
  // to sync in vIDE Sync's Git category rather than General (vide:editor:).
  blameAnnotationsEnabled: 'vide:git:blameAnnotationsEnabled',
  blameDisplayMode: 'vide:git:blameDisplayMode',
  inlineDiffEnabled: 'vide:git:inlineDiffEnabled',
  inlineDiffColors: 'vide:git:inlineDiffColors',
  inlineDiffCustomColors: 'vide:git:inlineDiffCustomColors',
  inlineDiffStrength: 'vide:git:inlineDiffStrength',
  inlineDiffFooterIcon: 'vide:git:inlineDiffFooterIcon',
}

export type MarkdownOpenMode = 'editor' | 'preview' | 'split'
export type BlameDisplayMode = 'editor' | 'footer'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

function getMarkdownOpenMode(key: string, def: MarkdownOpenMode): MarkdownOpenMode {
  const v = localStorage.getItem(key)
  return v === 'editor' || v === 'preview' || v === 'split' ? v : def
}

function getChangeColorMode(): ChangeColorMode {
  return localStorage.getItem(KEYS.inlineDiffColors) === 'custom' ? 'custom' : 'default'
}

function getChangeStrength(): ChangeStrength {
  const v = localStorage.getItem(KEYS.inlineDiffStrength)
  return v === 'subtle' || v === 'strong' ? v : 'medium'
}

function getCustomChangeColors(): ChangeColors {
  try {
    const saved = JSON.parse(localStorage.getItem(KEYS.inlineDiffCustomColors) ?? 'null')
    return { ...DEFAULT_CUSTOM_CHANGE_COLORS, ...(saved ?? {}) }
  } catch {
    return DEFAULT_CUSTOM_CHANGE_COLORS
  }
}

interface EditorSettingsStore {
  autoSaveEnabled: boolean
  setAutoSaveEnabled: (value: boolean) => void
  wordWrapEnabled: boolean
  setWordWrapEnabled: (value: boolean) => void
  toggleWordWrap: () => void
  // What clicking a .md file in the file tree does by default — the
  // context-menu's explicit "Open / Edit" / "View in Markdown Viewer"
  // actions always ignore this and do exactly what they say.
  markdownOpenMode: MarkdownOpenMode
  setMarkdownOpenMode: (value: MarkdownOpenMode) => void
  // Current-line git-blame annotation (end-of-line author/date/summary,
  // GitLens-style) - on by default, matching the feature's original
  // always-on behavior.
  blameAnnotationsEnabled: boolean
  setBlameAnnotationsEnabled: (value: boolean) => void
  // Where current-line blame shows: end of the line in the editor, or the footer.
  blameDisplayMode: BlameDisplayMode
  setBlameDisplayMode: (value: BlameDisplayMode) => void
  // Line wash + word-level highlight on uncommitted changes. The gutter's
  // line-number markers stay on regardless; this only hides the extra layer.
  inlineDiffEnabled: boolean
  setInlineDiffEnabled: (value: boolean) => void
  toggleInlineDiff: () => void
  // Colours for the gutter markers, line tint and word highlight: Default
  // (fixed green/amber/red, retuned for light themes) or the user's own.
  inlineDiffColors: ChangeColorMode
  setInlineDiffColors: (value: ChangeColorMode) => void
  inlineDiffCustomColors: ChangeColors
  setInlineDiffCustomColor: (kind: keyof ChangeColors, hex: string) => void
  inlineDiffStrength: ChangeStrength
  setInlineDiffStrength: (value: ChangeStrength) => void
  // Whether the footer shows the inline diff on/off icon.
  inlineDiffFooterIcon: boolean
  setInlineDiffFooterIcon: (value: boolean) => void
}

export const useEditorSettingsStore = create<EditorSettingsStore>((set, get) => ({
  autoSaveEnabled: getBool(KEYS.autoSaveEnabled, false),

  setAutoSaveEnabled: (value) => {
    localStorage.setItem(KEYS.autoSaveEnabled, String(value))
    set({ autoSaveEnabled: value })
  },

  wordWrapEnabled: getBool(KEYS.wordWrapEnabled, false),

  setWordWrapEnabled: (value) => {
    localStorage.setItem(KEYS.wordWrapEnabled, String(value))
    set({ wordWrapEnabled: value })
  },

  toggleWordWrap: () => get().setWordWrapEnabled(!get().wordWrapEnabled),

  markdownOpenMode: getMarkdownOpenMode(KEYS.markdownOpenMode, 'editor'),

  setMarkdownOpenMode: (value) => {
    localStorage.setItem(KEYS.markdownOpenMode, value)
    set({ markdownOpenMode: value })
  },

  blameAnnotationsEnabled: getBool(KEYS.blameAnnotationsEnabled, true),

  setBlameAnnotationsEnabled: (value) => {
    localStorage.setItem(KEYS.blameAnnotationsEnabled, String(value))
    set({ blameAnnotationsEnabled: value })
    notifySettingChanged()
  },

  // Footer by default; only an explicitly saved 'editor' choice keeps it in-line.
  blameDisplayMode: localStorage.getItem(KEYS.blameDisplayMode) === 'editor' ? 'editor' : 'footer',

  setBlameDisplayMode: (value) => {
    localStorage.setItem(KEYS.blameDisplayMode, value)
    set({ blameDisplayMode: value })
    notifySettingChanged()
  },

  inlineDiffEnabled: getBool(KEYS.inlineDiffEnabled, true),

  setInlineDiffEnabled: (value) => {
    localStorage.setItem(KEYS.inlineDiffEnabled, String(value))
    set({ inlineDiffEnabled: value })
    notifySettingChanged()
  },

  toggleInlineDiff: () => get().setInlineDiffEnabled(!get().inlineDiffEnabled),

  inlineDiffColors: getChangeColorMode(),

  setInlineDiffColors: (value) => {
    localStorage.setItem(KEYS.inlineDiffColors, value)
    set({ inlineDiffColors: value })
    notifySettingChanged()
  },

  inlineDiffCustomColors: getCustomChangeColors(),

  setInlineDiffCustomColor: (kind, hex) => {
    const next = { ...get().inlineDiffCustomColors, [kind]: hex }
    localStorage.setItem(KEYS.inlineDiffCustomColors, JSON.stringify(next))
    set({ inlineDiffCustomColors: next })
    notifySettingChanged()
  },

  inlineDiffStrength: getChangeStrength(),

  setInlineDiffStrength: (value) => {
    localStorage.setItem(KEYS.inlineDiffStrength, value)
    set({ inlineDiffStrength: value })
    notifySettingChanged()
  },

  inlineDiffFooterIcon: getBool(KEYS.inlineDiffFooterIcon, true),

  setInlineDiffFooterIcon: (value) => {
    localStorage.setItem(KEYS.inlineDiffFooterIcon, String(value))
    set({ inlineDiffFooterIcon: value })
    notifySettingChanged()
  },
}))

// Keeps the root element's change-colour CSS variables in step with the
// settings: once at startup (which also covers values vIDE Sync pulled in,
// since preBootSync writes them to localStorage before this store loads),
// then on every change.
function syncChangeColors(s: EditorSettingsStore) {
  applyGitChangeColors(s.inlineDiffColors, s.inlineDiffCustomColors, s.inlineDiffStrength)
}
syncChangeColors(useEditorSettingsStore.getState())
useEditorSettingsStore.subscribe(syncChangeColors)
