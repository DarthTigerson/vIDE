import { create } from 'zustand'
import { useEditorStore } from './editorStore'
import { isScratchTab } from '@/components/Editor/paths'
import type { Tab } from '@/types/index'

// One tab by path, or a bulk close carrying how many buffers it would destroy.
export type PendingDiscard =
  | { kind: 'tab'; paneId: string; path: string }
  | { kind: 'all'; count: number }

interface DiscardScratchStore {
  pending: PendingDiscard | null
  clear: () => void
}

// Shared by every route that closes a tab — the tab's ×, the tab context menu,
// Cmd+W and Close All — so an unsaved scratch tab gets the same confirmation
// from all of them. Lives in a store rather than TabBar's local state because
// Cmd+W is handled in App.tsx, nowhere near a TabBar instance.
export const useDiscardScratchStore = create<DiscardScratchStore>((set) => ({
  pending: null,
  clear: () => set({ pending: null }),
}))

// A buffer that exists nowhere but in memory: closing it is unrecoverable,
// unlike a dirty tab backed by a file, which still has its on-disk copy.
function isUnsavedScratch(tab: Tab): boolean {
  return isScratchTab(tab.path) && tab.content !== ''
}

// Closes the tab, unless it would destroy an unsaved scratch buffer — those
// raise the confirmation instead. Returns nothing: callers should not care
// which of the two happened.
export function requestCloseTab(paneId: string, path: string) {
  const tab = useEditorStore.getState().tabs.find((t) => t.path === path)
  if (tab && isUnsavedScratch(tab)) {
    useDiscardScratchStore.setState({ pending: { kind: 'tab', paneId, path } })
    return
  }
  useEditorStore.getState().closeTabInPane(paneId, path)
}

// Same guard for Close All, which used to discard every unsaved scratch buffer
// silently. Prompts once with the count rather than once per tab.
export function requestCloseAllTabs() {
  const count = useEditorStore.getState().tabs.filter(isUnsavedScratch).length
  if (count > 0) {
    useDiscardScratchStore.setState({ pending: { kind: 'all', count } })
    return
  }
  useEditorStore.getState().closeAllTabs()
}
