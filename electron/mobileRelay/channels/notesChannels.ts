import { registerChannel } from '../dispatch'
import { notesRoot, ensureNotesRoot, startNotesWatcher, createNote, createFolder, renameEntry, searchNotes } from '../../notes'

// Notes channels, mirroring the ipcMain wiring in electron/notes.ts's
// registerNotesHandlers() — same channel names, same argument order, same
// delegation to notes.ts's exported functions (not a reimplementation):
// createNote/createFolder/renameEntry apply the same sanitizeEntryName/
// forceMdExtension/collision-guard rules the desktop handlers do, and
// searchNotes is the same title-or-content search (capped at
// MAX_SEARCH_RESULTS, returning { path, name, snippet }) rather than a
// weaker content-only reimplementation.
export function registerNotesRelayChannels(): void {
  registerChannel('notes:getRoot', async () => {
    const root = await ensureNotesRoot()
    startNotesWatcher(root)
    return root
  })
  registerChannel('notes:createNote', (dirPath: string, name: string) => createNote(dirPath, name))
  registerChannel('notes:createFolder', (dirPath: string, name: string) => createFolder(dirPath, name))
  registerChannel('notes:renameEntry', (oldPath: string, newName: string, isNote: boolean) =>
    renameEntry(oldPath, newName, isNote))
  registerChannel('notes:search', (query: string) => searchNotes(notesRoot(), query))
}
