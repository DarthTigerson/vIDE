import { useEditorStore } from '@/stores/editorStore'
import { useGitSettingsStore } from '@/stores/gitSettingsStore'
import { getBiggestPaneId } from '@/lib/paneLayout'

export interface PaletteStepItem {
  id: string
  label: string
  description?: string
}

// A second list the palette swaps to after a command that needs an argument
// (e.g. which branch to merge). onPick runs after the palette has closed.
export interface PaletteStep {
  placeholder: string
  emptyText: string
  items: PaletteStepItem[]
  onPick: (id: string) => void
}

interface CommandBase {
  id: string
  label: string
  description?: string
  keywords?: string[]
  // Hides the command entirely (e.g. "Switch to Claude" while Claude is
  // already the active assistant).
  condition?: () => boolean
  // Greys the row and shows the returned reason in place of the description.
  // null means the command can run right now.
  disabledReason?: () => string | null
  // Red styling for commands that can destroy work. Whether and how the
  // command confirms is up to the command itself.
  danger?: boolean
  // Shown as a muted hint on the right, for commands that have a known
  // keyboard shortcut - left unset for the ones that don't.
  shortcut?: string
}

export type Command = CommandBase &
  (
    | { action: () => void; pick?: undefined }
    // Two-step command: the palette shows the returned step's list instead of
    // running anything, then calls step.onPick with the chosen item.
    | { pick: () => PaletteStep | Promise<PaletteStep>; action?: undefined }
  )

export function openTab(path: string) {
  useEditorStore.getState().openTab({ path, content: '', dirty: false })
}

// Shared by the Git Graph and Git Branch Diff commands — mirrors the
// "open in biggest pane" pattern used elsewhere for these tabs.
export function openGitTab(path: string) {
  const tab = { path, content: '', dirty: false }
  if (useGitSettingsStore.getState().openInBiggestPane) {
    const biggestPaneId = getBiggestPaneId()
    if (biggestPaneId) {
      useEditorStore.getState().openTabInPane(tab, biggestPaneId)
      return
    }
  }
  useEditorStore.getState().openTab(tab)
}
