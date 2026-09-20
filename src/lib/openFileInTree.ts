import { useEditorStore } from '@/stores/editorStore'
import { usePanelRequestStore } from '@/stores/panelRequestStore'
import { useSidebarUiStore } from '@/stores/sidebarUiStore'

// Opens a file as a new tab in `paneId` (leaving the current tab, e.g. a diff,
// in place), asks App to swap the left panel to the file tree, and asks the
// tree to reveal the file. Reads first, so an unreadable file leaves the panel
// and tabs untouched.
export async function openFileInTree(path: string, paneId: string): Promise<void> {
  const content = await window.api.readFile(path)
  useEditorStore.getState().openTabInPane({ path, content, dirty: false }, paneId)
  usePanelRequestStore.getState().requestPanel('files')
  useSidebarUiStore.getState().requestReveal(path)
}
