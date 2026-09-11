import { create } from 'zustand'

interface SearchState {
  commandPaletteOpen: boolean
  searchOpen: boolean
  actionPaletteOpen: boolean
  shortcutsOverlayOpen: boolean
  recentProjectsPaletteOpen: boolean
  branchPaletteOpen: boolean
  repoPaletteOpen: boolean
  openCommandPalette: () => void
  closeCommandPalette: () => void
  openSearch: () => void
  closeSearch: () => void
  openActionPalette: () => void
  closeActionPalette: () => void
  openShortcutsOverlay: () => void
  closeShortcutsOverlay: () => void
  openRecentProjectsPalette: () => void
  closeRecentProjectsPalette: () => void
  openBranchPalette: () => void
  closeBranchPalette: () => void
  openRepoPalette: () => void
  closeRepoPalette: () => void
}

export const useSearchStore = create<SearchState>((set) => ({
  commandPaletteOpen: false,
  searchOpen: false,
  actionPaletteOpen: false,
  shortcutsOverlayOpen: false,
  recentProjectsPaletteOpen: false,
  branchPaletteOpen: false,
  repoPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),
  openActionPalette: () => set({ actionPaletteOpen: true }),
  closeActionPalette: () => set({ actionPaletteOpen: false }),
  openShortcutsOverlay: () => set({ shortcutsOverlayOpen: true }),
  closeShortcutsOverlay: () => set({ shortcutsOverlayOpen: false }),
  openRecentProjectsPalette: () => set({ recentProjectsPaletteOpen: true }),
  closeRecentProjectsPalette: () => set({ recentProjectsPaletteOpen: false }),
  openBranchPalette: () => set({ branchPaletteOpen: true }),
  closeBranchPalette: () => set({ branchPaletteOpen: false }),
  openRepoPalette: () => set({ repoPaletteOpen: true }),
  closeRepoPalette: () => set({ repoPaletteOpen: false }),
}))
