import { create } from 'zustand'
import { useThemeStore, familyOf } from './themeStore'
import { notifySettingChanged } from '../lib/notifySettingChanged'
import { DEFAULT_TOKENS, THEME_PALETTES, type HighContrastTokens } from '../monacoThemes'
import { isValidHex } from '../lib/color'

const FONT_KEY = 'vide:font'
const PANEL_STYLE_KEY = 'vide:panelStyle'
const FOOTER_CONTENT_KEY = 'vide:footerContent'
const MEMORY_USAGE_VISIBLE_KEY = 'vide:memoryUsageVisible'
const BACKGROUND_IMAGE_KEY = 'vide:backgroundImage'
const BACKGROUND_IMAGE_VISIBLE_KEY = 'vide:backgroundImageVisible'
const NAVBAR_POSITION_KEY = 'vide:navbarPosition'
const EDITOR_COLOR_SCHEME_KEY = 'vide:editorColorScheme'
const EDITOR_TOKEN_COLORS_KEY = 'vide:editorTokenColors'

// Presets are limited to monospace fonts that ship preinstalled with a
// major OS (macOS: Menlo/Monaco, Windows: Consolas, both: Courier New).
// "SF Mono" and other popular coding fonts (JetBrains Mono, Fira Code, etc.)
// were removed — they aren't registered for CSS font-family matching unless
// the user has separately installed them, so picking them silently fell
// back to the generic monospace font and looked like the picker was broken.
export const FONT_PRESETS = [
  { label: 'Menlo',       value: 'Menlo, monospace' },
  { label: 'Monaco',      value: 'Monaco, monospace' },
  { label: 'Consolas',    value: 'Consolas, monospace' },
  { label: 'Courier New', value: 'Courier New, monospace' },
] as const

export type PanelStyle = 'solid' | 'glossy' | 'glass' | 'brushed-metal'

// Shared between DisplayPage and the setup wizard's theme step, so both
// pickers stay in sync rather than duplicating this list.
export const PANEL_STYLE_OPTIONS: { value: PanelStyle; label: string; description: string }[] = [
  { value: 'brushed-metal', label: 'Brush Metal', description: 'Welder approved' },
  { value: 'solid',         label: 'Solid',       description: 'Solid panels' },
  { value: 'glossy',        label: 'Glossy',      description: 'Frosted glass' },
  { value: 'glass',         label: 'Glass',       description: 'See-through' },
]

// More may be added later (e.g. a combined view) - kept as its own union
// rather than a boolean so the settings dropdown and FooterMessage's switch
// don't need reshaping when that happens.
export type FooterContent = 'hints' | 'clock'

export type BackgroundImage = 'none' | 'vide' | 'clawd' | 'atreus' | 'link' | 'techLines' | 'borahae' | 'wave' | 'gabriele' | 'rockhoppers' | 'goodGirl'

// Shared between DisplayPage and the setup wizard's theme step, same as
// PANEL_STYLE_OPTIONS below.
export const BACKGROUND_IMAGE_OPTIONS: { value: BackgroundImage; label: string }[] = [
  { value: 'none',      label: 'None' },
  { value: 'clawd',     label: 'Clawd' },
  { value: 'vide',      label: 'vIDE' },
  { value: 'link',      label: 'Link' },
  { value: 'atreus',    label: 'Atreus' },
  { value: 'borahae',   label: 'Borahae' },
  { value: 'gabriele',  label: 'Gabriele' },
  { value: 'rockhoppers', label: 'Rockhoppers' },
  { value: 'goodGirl',    label: 'Good Girl' },
  { value: 'techLines', label: 'Tech Lines' },
  { value: 'wave',      label: 'Wave' },
]

// Each built-in theme family's matching background — swapping the active
// theme family swaps the background to follow (see the useThemeStore
// subscription below). Luuk has no artwork of its own, so it uses
// Rockhoppers rather than leaving whatever was previously selected.
const FAMILY_BACKGROUND: Record<string, BackgroundImage> = {
  claude: 'clawd',
  thomas: 'vide',
  link: 'link',
  atreus: 'atreus',
  borahae: 'borahae',
  gabriele: 'gabriele',
  luuk: 'rockhoppers',
}

// Which physical side the primary (Explorer/Git/Settings) activity bar and
// its Sidebar panel render on; the Claude/assistant activity bar and Chat
// panel always take the opposite side — see App.tsx's mirrored layout.
export type NavbarPosition = 'left' | 'right'

// Syntax color scheme for the Monaco editor — independent of the app Theme.
// Internal values/ids are unchanged from before the user-facing rename below
// (kept as-is for persisted-settings compatibility and to avoid a purely
// cosmetic rename through monacoThemes.ts's HIGH_CONTRAST_TOKENS/
// MARIO_MODE_*/etc.): 'high-contrast' — labeled "Theme Colour Match" —
// follows whichever theme family/variant is active rather than being a
// sticky standalone choice; 'mario-mode' — labeled "High Contrast (Mario
// Mode)" — ignores the active theme entirely, same fixed black background
// and palette no matter what.
export type EditorColorScheme = 'default' | 'high-contrast' | 'mario-mode' | 'custom'

export const EDITOR_COLOR_SCHEME_OPTIONS: { value: EditorColorScheme; label: string; description: string }[] = [
  { value: 'default',       label: 'Default',                     description: "Follows the active theme's own syntax colors" },
  { value: 'high-contrast', label: 'Theme Colour Match',           description: "High-visibility syntax colors derived from your theme's own accent" },
  { value: 'mario-mode',    label: 'High Contrast (Mario Mode)',   description: 'Bold primary colors on black — maximum readability' },
  { value: 'custom',        label: 'Custom',                      description: 'Pick each syntax color yourself' },
]

// The five syntax colours the Custom scheme exposes, in the order they're
// listed in Settings. Labels name the thing the user actually sees on
// screen — "Type" alone reads as a language-nerd term, but it's also what
// paints a YAML/JSON key, which is the most common reason to come here.
export const EDITOR_TOKEN_FIELDS: { key: keyof HighContrastTokens; label: string }[] = [
  { key: 'keyword', label: 'Keyword' },
  { key: 'string',  label: 'String' },
  { key: 'number',  label: 'Number' },
  { key: 'type',    label: 'Type / key' },
  { key: 'comment', label: 'Comment' },
]

const DEFAULT_FONT = 'Menlo, monospace'

interface DisplayStore {
  font: string
  panelStyle: PanelStyle
  footerContent: FooterContent
  memoryUsageVisible: boolean
  backgroundImage: BackgroundImage
  navbarPosition: NavbarPosition
  editorColorScheme: EditorColorScheme
  editorTokenColors: HighContrastTokens
  setFont: (font: string) => void
  setPanelStyle: (style: PanelStyle) => void
  setFooterContent: (content: FooterContent) => void
  setMemoryUsageVisible: (visible: boolean) => void
  setBackgroundImage: (image: BackgroundImage) => void
  setNavbarPosition: (position: NavbarPosition) => void
  setEditorColorScheme: (scheme: EditorColorScheme) => void
  setEditorTokenColor: (key: keyof HighContrastTokens, hex: string) => void
  resetEditorTokenColors: () => void
}

function applyFont(font: string) {
  document.documentElement.style.setProperty('--font-mono', font)
  localStorage.setItem(FONT_KEY, font)
}

function applyPanelStyle(style: PanelStyle) {
  document.documentElement.setAttribute('data-panel-style', style)
  localStorage.setItem(PANEL_STYLE_KEY, style)
}

// --color-bg/panel/sidebar/tab-bar/border are inherited CSS custom
// properties, and Glossy/Glass (translucent rgba) and Solid/Brush Metal
// (bolder border) each redefine some of them on `<html>` while active.
// Because they're inherited, ANY element reading e.g. var(--color-sidebar)
// picks up whichever panel style is globally active right now — including
// the Panel Style picker's own preview thumbnails, which need to show each
// option's colours independent of whatever's actually selected. This reads
// what those variables would compute to with no data-panel-style override
// at all, i.e. the theme's own base colours — temporarily removing the
// attribute, reading, then restoring it, synchronously, so there's no
// visible flash. Same technique customThemeStore.ts's readBuiltInPalette
// uses for an analogous problem.
export function basePanelColors(): { bg: string; panel: string; sidebar: string; tabBar: string; border: string } {
  const el = document.documentElement
  const original = el.getAttribute('data-panel-style')
  el.removeAttribute('data-panel-style')
  const styles = getComputedStyle(el)
  const result = {
    bg: styles.getPropertyValue('--color-bg').trim(),
    panel: styles.getPropertyValue('--color-panel').trim(),
    sidebar: styles.getPropertyValue('--color-sidebar').trim(),
    tabBar: styles.getPropertyValue('--color-tab-bar').trim(),
    border: styles.getPropertyValue('--color-border').trim(),
  }
  if (original === null) el.removeAttribute('data-panel-style')
  else el.setAttribute('data-panel-style', original)
  return result
}

const storedFont = localStorage.getItem(FONT_KEY)
const initialFont = storedFont && FONT_PRESETS.some((p) => p.value === storedFont) ? storedFont : DEFAULT_FONT
const storedPanelStyle = localStorage.getItem(PANEL_STYLE_KEY)
const initialPanelStyle: PanelStyle = PANEL_STYLE_OPTIONS.some((o) => o.value === storedPanelStyle)
  ? (storedPanelStyle as PanelStyle)
  : 'solid'
const storedFooterContent = localStorage.getItem(FOOTER_CONTENT_KEY)
const initialFooterContent: FooterContent = storedFooterContent === 'clock' ? 'clock' : 'hints'
const storedMemoryUsageVisible = localStorage.getItem(MEMORY_USAGE_VISIBLE_KEY)
const initialMemoryUsageVisible = storedMemoryUsageVisible === null ? true : storedMemoryUsageVisible === 'true'
// Migrates the old on/off toggle (pre-dating the None/vIDE/Clawd picker):
// if a background image was already selected, this key exists and wins; if
// only the old boolean is present, "on" carries forward as the vIDE badge
// (the only option that used to exist) and "off"/absent becomes "none".
const storedBackgroundImage = localStorage.getItem(BACKGROUND_IMAGE_KEY) as BackgroundImage | null
const initialBackgroundImage: BackgroundImage = storedBackgroundImage && BACKGROUND_IMAGE_OPTIONS.some((o) => o.value === storedBackgroundImage)
  ? storedBackgroundImage
  : localStorage.getItem(BACKGROUND_IMAGE_VISIBLE_KEY) === 'true' ? 'vide' : 'none'
const storedNavbarPosition = localStorage.getItem(NAVBAR_POSITION_KEY)
const initialNavbarPosition: NavbarPosition = storedNavbarPosition === 'right' ? 'right' : 'left'
const storedEditorColorScheme = localStorage.getItem(EDITOR_COLOR_SCHEME_KEY)
const initialEditorColorScheme: EditorColorScheme = EDITOR_COLOR_SCHEME_OPTIONS.some((o) => o.value === storedEditorColorScheme)
  ? (storedEditorColorScheme as EditorColorScheme)
  : 'default'

// The Custom scheme starts from Monaco's own stock colours, so opening the
// picker (or hitting Reset) shows something that already looks right rather
// than five blanks. Keyed off the ACTIVE theme's base, not a fixed 'vs-dark':
// seeding a light theme with the dark palette puts e.g. #b5cea8 numbers on a
// white background, which is the unreadable state the picker exists to fix.
// Returns a fresh object every call — the DEFAULT_TOKENS entries are shared
// module state that nothing may mutate.
export function defaultEditorTokenColors(): HighContrastTokens {
  return { ...DEFAULT_TOKENS[THEME_PALETTES[useThemeStore.getState().theme].base] }
}

// Per-field validation, not all-or-nothing: this value round-trips through
// the settings-sync repo as plain text, so a hand-edited or partially
// corrupt entry must degrade to the stock colour for that one token instead
// of painting the editor with `undefined`.
function loadEditorTokenColors(): HighContrastTokens {
  const result = defaultEditorTokenColors()
  const raw = localStorage.getItem(EDITOR_TOKEN_COLORS_KEY)
  if (!raw) return result
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return result
  }
  if (!parsed || typeof parsed !== 'object') return result
  for (const key of Object.keys(result) as (keyof HighContrastTokens)[]) {
    const value = (parsed as Record<string, unknown>)[key]
    if (typeof value === 'string' && isValidHex(value)) result[key] = value
  }
  return result
}

const initialEditorTokenColors = loadEditorTokenColors()

function applyEditorTokenColors(tokens: HighContrastTokens) {
  localStorage.setItem(EDITOR_TOKEN_COLORS_KEY, JSON.stringify(tokens))
}

applyFont(initialFont)
applyPanelStyle(initialPanelStyle)

export const useDisplayStore = create<DisplayStore>((set) => ({
  font: initialFont,
  panelStyle: initialPanelStyle,
  footerContent: initialFooterContent,
  memoryUsageVisible: initialMemoryUsageVisible,
  backgroundImage: initialBackgroundImage,
  navbarPosition: initialNavbarPosition,
  editorColorScheme: initialEditorColorScheme,
  editorTokenColors: initialEditorTokenColors,
  setFont: (font) => {
    applyFont(font)
    set({ font })
    notifySettingChanged()
  },
  setPanelStyle: (style) => {
    applyPanelStyle(style)
    set({ panelStyle: style })
    notifySettingChanged()
  },
  setFooterContent: (content) => {
    localStorage.setItem(FOOTER_CONTENT_KEY, content)
    set({ footerContent: content })
    notifySettingChanged()
  },
  setMemoryUsageVisible: (visible) => {
    localStorage.setItem(MEMORY_USAGE_VISIBLE_KEY, String(visible))
    set({ memoryUsageVisible: visible })
    notifySettingChanged()
  },
  setBackgroundImage: (image) => {
    localStorage.setItem(BACKGROUND_IMAGE_KEY, image)
    set({ backgroundImage: image })
    notifySettingChanged()
  },
  setNavbarPosition: (position) => {
    localStorage.setItem(NAVBAR_POSITION_KEY, position)
    set({ navbarPosition: position })
    notifySettingChanged()
  },
  setEditorColorScheme: (scheme) => {
    localStorage.setItem(EDITOR_COLOR_SCHEME_KEY, scheme)
    set({ editorColorScheme: scheme })
    notifySettingChanged()
  },
  setEditorTokenColor: (key, hex) => {
    // The pickers already gate on isValidHex, but this is the boundary the
    // value gets persisted and handed to monaco.editor.defineTheme() at —
    // one bad foreground there rejects the whole theme definition.
    if (!isValidHex(hex)) return
    set((state) => {
      const next = { ...state.editorTokenColors, [key]: hex }
      applyEditorTokenColors(next)
      return { editorTokenColors: next }
    })
    notifySettingChanged()
  },
  resetEditorTokenColors: () => {
    const next = defaultEditorTokenColors()
    applyEditorTokenColors(next)
    set({ editorTokenColors: next })
    notifySettingChanged()
  },
}))

// Swaps the background image to match whenever the active theme family
// changes — whether from a built-in family card or activating a custom
// theme (which also calls setFamily(baseFamily)). Only fires on an actual
// family change, not a light/dark variant or "match system appearance"
// toggle within the same family, so those never disturb a background the
// user set explicitly.
useThemeStore.subscribe((state, prevState) => {
  const family = familyOf(state.theme)
  if (family === familyOf(prevState.theme)) return
  const next = FAMILY_BACKGROUND[family]
  if (next) useDisplayStore.getState().setBackgroundImage(next)
})
