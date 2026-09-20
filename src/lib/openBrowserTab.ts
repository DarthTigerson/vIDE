import { useEditorStore } from '@/stores/editorStore'
import { useBrowserSettingsStore } from '@/stores/browserSettingsStore'
import { getBiggestPaneId } from '@/lib/paneLayout'
import { buildBrowserPath } from '@/components/Settings/paths'

// Shared by App's "new browser" button and the action palette. Deliberately
// does not touch the left panel: App layers its own closeSidePanelOnOpen
// handling on top because that state lives in App.
export function openNewBrowserTab(): void {
  const id = Date.now().toString(36)
  const tab = { path: buildBrowserPath(id), content: '', dirty: false }
  const biggestPaneId = useBrowserSettingsStore.getState().openInBiggestPane ? getBiggestPaneId() : null
  if (biggestPaneId) {
    useEditorStore.getState().openTabInPane(tab, biggestPaneId)
  } else {
    useEditorStore.getState().openTab(tab)
  }
}
