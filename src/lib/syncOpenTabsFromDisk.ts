import { useEditorStore } from '@/stores/editorStore'
import { isReadOnlyTab } from '@/lib/tabKinds'
import { isScratchTab } from '@/components/Editor/paths'

// Re-reads every open, non-dirty file tab from disk. Called whenever the
// project's FileWatcher reports a change anywhere under the root — the only
// way to catch edits that didn't happen through the app's own save path
// (an agent writing files, `git checkout`, a formatter run from the
// terminal). Dirty tabs are skipped entirely: syncing those would either
// clobber unsaved edits or, worse, get overwritten right back by autosave.
export async function syncOpenTabsFromDisk(): Promise<void> {
  const { tabs, syncFromDisk } = useEditorStore.getState()

  await Promise.all(
    tabs
      .filter((tab) => !tab.dirty && !isReadOnlyTab(tab) && !isScratchTab(tab.path))
      .map(async (tab) => {
        try {
          const content = await window.api.readFile(tab.path)
          syncFromDisk(tab.path, content)
        } catch {
          // Deleted or unreadable — the existing missing-file tracking
          // (Editor's pathExists effect) handles surfacing that.
        }
      })
  )
}
