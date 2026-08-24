import { create } from 'zustand'

const FONT_KEY = 'vide:font'
const PANEL_STYLE_KEY = 'vide:panelStyle'
const FOOTER_CONTENT_KEY = 'vide:footerContent'
const MEMORY_USAGE_VISIBLE_KEY = 'vide:memoryUsageVisible'
const BACKGROUND_IMAGE_VISIBLE_KEY = 'vide:backgroundImageVisible'
const NAVBAR_POSITION_KEY = 'vide:navbarPosition'

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

export type PanelStyle = 'matt' | 'solid' | 'glossy' | 'glass'

// Shared between DisplayPage and the setup wizard's theme step, so both
// pickers stay in sync rather than duplicating this list.
export const PANEL_STYLE_OPTIONS: { value: PanelStyle; label: string; description: string }[] = [
  { value: 'matt',   label: 'Matt',          description: 'Solid panels' },
  { value: 'solid',  label: 'Solid Colours', description: 'Solid panels, bolder dividing lines' },
  { value: 'glossy', label: 'Glossy',        description: 'Frosted glass' },
  { value: 'glass',  label: 'Glass',         description: 'See-through, reveals the background image' },
]

// More may be added later (e.g. a combined view) - kept as its own union
// rather than a boolean so the settings dropdown and FooterMessage's switch
// don't need reshaping when that happens.
export type FooterContent = 'hints' | 'clock'

// Which physical side the primary (Explorer/Git/Settings) activity bar and
// its Sidebar panel render on; the Claude/assistant activity bar and Chat
// panel always take the opposite side — see App.tsx's mirrored layout.
export type NavbarPosition = 'left' | 'right'

const DEFAULT_FONT = 'Menlo, monospace'

interface DisplayStore {
  font: string
  panelStyle: PanelStyle
  footerContent: FooterContent
  memoryUsageVisible: boolean
  backgroundImageVisible: boolean
  navbarPosition: NavbarPosition
  setFont: (font: string) => void
  setPanelStyle: (style: PanelStyle) => void
  setFooterContent: (content: FooterContent) => void
  setMemoryUsageVisible: (visible: boolean) => void
  setBackgroundImageVisible: (visible: boolean) => void
  setNavbarPosition: (position: NavbarPosition) => void
}

function applyFont(font: string) {
  document.documentElement.style.setProperty('--font-mono', font)
  localStorage.setItem(FONT_KEY, font)
}

function applyPanelStyle(style: PanelStyle) {
  document.documentElement.setAttribute('data-panel-style', style)
  localStorage.setItem(PANEL_STYLE_KEY, style)
}

const storedFont = localStorage.getItem(FONT_KEY)
const initialFont = storedFont && FONT_PRESETS.some((p) => p.value === storedFont) ? storedFont : DEFAULT_FONT
const initialPanelStyle = (localStorage.getItem(PANEL_STYLE_KEY) as PanelStyle | null) || 'matt'
const storedFooterContent = localStorage.getItem(FOOTER_CONTENT_KEY)
const initialFooterContent: FooterContent = storedFooterContent === 'clock' ? 'clock' : 'hints'
const storedMemoryUsageVisible = localStorage.getItem(MEMORY_USAGE_VISIBLE_KEY)
const initialMemoryUsageVisible = storedMemoryUsageVisible === null ? true : storedMemoryUsageVisible === 'true'
const initialBackgroundImageVisible = localStorage.getItem(BACKGROUND_IMAGE_VISIBLE_KEY) === 'true'
const storedNavbarPosition = localStorage.getItem(NAVBAR_POSITION_KEY)
const initialNavbarPosition: NavbarPosition = storedNavbarPosition === 'right' ? 'right' : 'left'
applyFont(initialFont)
applyPanelStyle(initialPanelStyle)

export const useDisplayStore = create<DisplayStore>((set) => ({
  font: initialFont,
  panelStyle: initialPanelStyle,
  footerContent: initialFooterContent,
  memoryUsageVisible: initialMemoryUsageVisible,
  backgroundImageVisible: initialBackgroundImageVisible,
  navbarPosition: initialNavbarPosition,
  setFont: (font) => {
    applyFont(font)
    set({ font })
  },
  setPanelStyle: (style) => {
    applyPanelStyle(style)
    set({ panelStyle: style })
  },
  setFooterContent: (content) => {
    localStorage.setItem(FOOTER_CONTENT_KEY, content)
    set({ footerContent: content })
  },
  setMemoryUsageVisible: (visible) => {
    localStorage.setItem(MEMORY_USAGE_VISIBLE_KEY, String(visible))
    set({ memoryUsageVisible: visible })
  },
  setBackgroundImageVisible: (visible) => {
    localStorage.setItem(BACKGROUND_IMAGE_VISIBLE_KEY, String(visible))
    set({ backgroundImageVisible: visible })
  },
  setNavbarPosition: (position) => {
    localStorage.setItem(NAVBAR_POSITION_KEY, position)
    set({ navbarPosition: position })
  },
}))
