import { useEditorStore } from '@/stores/editorStore'

// Shared by lspClient.ts (cross-file go-to-definition) and the Claude
// terminal's clickable file paths — both need "open this absolute path,
// reusing an already-open tab if there is one, then jump to a location."
// searchTerm sets how much text the editor highlights at the location (it
// selects col .. col + searchTerm.length); search results pass the matched text.
export async function openFileAtLocation(path: string, line?: number, col?: number, searchTerm = ''): Promise<void> {
  const { tabs, openTab, setRevealRequest } = useEditorStore.getState()
  const existingTab = tabs.find((t) => t.path === path)
  if (existingTab) {
    openTab({ path: existingTab.path, content: existingTab.content, dirty: existingTab.dirty })
  } else {
    const content = await window.api.readFile(path)
    openTab({ path, content, dirty: false })
  }
  if (line !== undefined) {
    useEditorStore.getState().setRevealRequest({ path, line, col: col ?? 1, searchTerm })
  }
}
