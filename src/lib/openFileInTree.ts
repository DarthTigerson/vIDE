import { openFile } from '@/lib/openFile'
import { usePanelRequestStore } from '@/stores/panelRequestStore'
import { useSidebarUiStore } from '@/stores/sidebarUiStore'

// Opens a file as a new tab in `paneId` (leaving the current tab, e.g. a diff,
// in place), asks App to swap the left panel to the file tree, and asks the
// tree to reveal the file. Reads first (text files), so an unreadable file leaves the panel
// and tabs untouched.
export async function openFileInTree(path: string, paneId: string): Promise<void> {
  await openFile(path, { paneId })
  usePanelRequestStore.getState().requestPanel('files')
  useSidebarUiStore.getState().requestReveal(path)
}
