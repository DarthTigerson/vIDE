import { useEditorStore } from '@/stores/editorStore'
import { openFile } from '@/lib/openFile'

// Opens through openFile's routing, so images get their viewer rather than text.
// Shared by lspClient.ts (cross-file go-to-definition) and the Claude
// terminal's clickable file paths — both need "open this absolute path,
// reusing an already-open tab if there is one, then jump to a location."
// searchTerm sets how much text the editor highlights at the location (it
// selects col .. col + searchTerm.length); search results pass the matched text.
// stayInActivePane keeps the file in the window you're working in instead of
// following Settings > General > "Open new tabs in" - go-to-definition uses
// it, since jumping to a definition in another window is disorienting.
export async function openFileAtLocation(
  path: string,
  line?: number,
  col?: number,
  searchTerm = '',
  { stayInActivePane = false }: { stayInActivePane?: boolean } = {},
): Promise<void> {
  // A jump to a line needs text, so an SVG opens as source then; an image
  // just opens its viewer and the location is ignored.
  const route = await openFile(path, {
    source: line !== undefined,
    paneId: stayInActivePane ? useEditorStore.getState().activePaneId : undefined,
  })
  if (line !== undefined && route.tabPath === path) {
    useEditorStore.getState().setRevealRequest({ path, line, col: col ?? 1, searchTerm })
  }
}
