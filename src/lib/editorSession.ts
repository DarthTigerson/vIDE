import type { SessionData } from '@/types/api'
import { restoredEditorState, useEditorStore } from '@/stores/editorStore'
import { useFileStore } from '@/stores/fileStore'
import {
  isImagePreviewTab,
  isMarkdownPreviewTab,
  parseImagePreviewPath,
  parseMarkdownPreviewPath,
} from '@/components/Viewer/paths'
import { isTerminalTab } from '@/components/Settings/paths'

// Saves each project's open tabs, split layout and active tab into its session
// file, and brings them back when the project opens again. Tabs backed by a
// file are restored, and terminal tabs come back as a fresh shell (TerminalTab
// spawns one when no live terminal has its id); settings, git, browser and
// scratch tabs are left out.

const SAVE_DEBOUNCE_MS = 500

// The file a restorable tab shows, or null for a tab that can't come back.
export function fileBehindTab(path: string): string | null {
  if (isImagePreviewTab(path)) return parseImagePreviewPath(path)
  if (isMarkdownPreviewTab(path)) return parseMarkdownPreviewPath(path)
  return path.startsWith('/') ? path : null
}

// The project whose tabs are currently in the editor because they were
// restored (or found nothing to restore). Saving is held off until then:
// the empty editor a project starts with must not overwrite its saved tabs.
let restoredRoot: string | null = null
let pending: { root: string; data: SessionData } | null = null
let timer: ReturnType<typeof setTimeout> | undefined

function flush(): void {
  clearTimeout(timer)
  timer = undefined
  if (!pending) return
  void window.api.sessionSave(pending.root, pending.data)
  pending = null
}

export async function restoreEditorSession(root: string, data: SessionData | null): Promise<void> {
  flush()
  restoredRoot = null
  const contents: Record<string, string> = {}
  const paths = [...new Set(Object.values(data?.paneTabLists ?? {}).flat())]
  await Promise.all(paths.map(async (path) => {
    if (typeof path !== 'string') return
    if (isTerminalTab(path)) {
      contents[path] = ''
      return
    }
    const file = fileBehindTab(path)
    if (!file) return
    try {
      if (file === path) contents[path] = await window.api.readFile(file)
      else if (await window.api.pathExists(file)) contents[path] = ''
    } catch {
      // deleted or unreadable since last time — its tab just doesn't come back
    }
  }))
  if (useFileStore.getState().projectRoot !== root) return
  // A tab opened while the files were loading wins over the saved set.
  if (useEditorStore.getState().tabs.length === 0) {
    const state = data ? restoredEditorState(data, contents) : null
    if (state) useEditorStore.setState(state)
  }
  restoredRoot = root
}

// The root and tabs are captured when the change happens, not when the
// debounced write fires, so a project switch inside the debounce window can't
// save one project's (reset) tabs under the other's name.
export function startEditorSessionPersistence(): () => void {
  const unsubscribe = useEditorStore.subscribe((state, prev) => {
    if (
      state.layout === prev.layout &&
      state.paneTabs === prev.paneTabs &&
      state.paneTabLists === prev.paneTabLists &&
      state.activePaneId === prev.activePaneId
    ) return
    const root = useFileStore.getState().projectRoot
    if (!root || root !== restoredRoot) return
    const { layout, paneTabs, paneTabLists, activePaneId, activeTabPath } = state
    pending = { root, data: { layout, paneTabs, paneTabLists, activePaneId, activeTabPath } }
    clearTimeout(timer)
    timer = setTimeout(flush, SAVE_DEBOUNCE_MS)
  })
  window.addEventListener('beforeunload', flush)
  return () => {
    unsubscribe()
    window.removeEventListener('beforeunload', flush)
    flush()
    restoredRoot = null
  }
}
