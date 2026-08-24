import { app, ipcMain } from 'electron'
import { join, dirname } from 'path'
import { access, mkdir, rename, writeFile } from 'fs/promises'

function notesRoot(): string {
  return join(app.getPath('userData'), 'notes')
}

async function ensureNotesRoot(): Promise<string> {
  const root = notesRoot()
  await mkdir(root, { recursive: true })
  return root
}

// Notes and folders are real files/directories on disk (not JSON records),
// so their names double as filesystem path segments — reject anything that
// would escape the notes root or collide with '.'/'..'.
function sanitizeEntryName(raw: string): string {
  const name = raw.trim()
  if (!name) throw new Error('Name is required')
  if (name === '.' || name === '..') throw new Error('Invalid name')
  if (/[/\\]/.test(name)) throw new Error('Name cannot contain / or \\')
  if (name.split('').some((ch) => ch.charCodeAt(0) < 0x20)) throw new Error('Name contains invalid characters')
  return name
}

// Notes are always .md — strip whatever extension (if any) the caller typed
// and force the real one, so the UI never has to show or ask about it.
function forceMdExtension(name: string): string {
  return name.replace(/\.[^./\\]*$/, '') + '.md'
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function createNote(dirPath: string, name: string): Promise<{ path: string; name: string }> {
  const finalName = forceMdExtension(sanitizeEntryName(name))
  const path = join(dirPath, finalName)
  await writeFile(path, '', { encoding: 'utf-8', flag: 'wx' })
  return { path, name: finalName }
}

async function createFolder(dirPath: string, name: string): Promise<{ path: string; name: string }> {
  const finalName = sanitizeEntryName(name)
  const path = join(dirPath, finalName)
  await mkdir(path, { recursive: false })
  return { path, name: finalName }
}

async function renameEntry(
  oldPath: string,
  newName: string,
  isNote: boolean
): Promise<{ path: string; name: string }> {
  const sanitized = sanitizeEntryName(newName)
  const finalName = isNote ? forceMdExtension(sanitized) : sanitized
  const newPath = join(dirname(oldPath), finalName)
  if (newPath === oldPath) return { path: oldPath, name: finalName }
  if (await pathExists(newPath)) throw new Error(`"${finalName}" already exists`)
  await rename(oldPath, newPath)
  return { path: newPath, name: finalName }
}

export function registerNotesHandlers(): void {
  ipcMain.handle('notes:getRoot', () => ensureNotesRoot())
  ipcMain.handle('notes:createNote', (_e, dirPath: string, name: string) => createNote(dirPath, name))
  ipcMain.handle('notes:createFolder', (_e, dirPath: string, name: string) => createFolder(dirPath, name))
  ipcMain.handle('notes:renameEntry', (_e, oldPath: string, newName: string, isNote: boolean) =>
    renameEntry(oldPath, newName, isNote)
  )
}
