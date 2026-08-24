import { app, ipcMain, shell } from 'electron'
import { join, dirname } from 'path'
import { access, mkdir, readFile, rename, writeFile } from 'fs/promises'

export interface NotesProject {
  id: string
  name: string
  createdAt: number
  rootPath: string
}

interface StoredNotesProject {
  id: string
  name: string
  createdAt: number
}

interface NotesData {
  projects: StoredNotesProject[]
}

function notebooksPath(): string {
  return join(app.getPath('userData'), 'notebooks.json')
}

function notesRoot(): string {
  return join(app.getPath('userData'), 'notes')
}

function notebookDir(id: string): string {
  return join(notesRoot(), id)
}

function withRootPath(project: StoredNotesProject): NotesProject {
  return { ...project, rootPath: notebookDir(project.id) }
}

async function readNotesData(): Promise<NotesData> {
  try {
    const data = await readFile(notebooksPath(), 'utf-8')
    return JSON.parse(data) as NotesData
  } catch {
    return { projects: [] }
  }
}

async function writeNotesData(data: NotesData): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(notebooksPath(), JSON.stringify(data), 'utf-8')
}

// Notes and folders are real files/directories on disk (not JSON records),
// so their names double as filesystem path segments — reject anything that
// would escape the notebook's own directory or collide with '.'/'..'.
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

async function listProjects(): Promise<NotesProject[]> {
  const data = await readNotesData()
  return data.projects.map(withRootPath)
}

async function createProject(name: string): Promise<NotesProject> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Notebook name is required')

  const data = await readNotesData()
  const project: StoredNotesProject = { id: crypto.randomUUID(), name: trimmed, createdAt: Date.now() }
  await mkdir(notebookDir(project.id), { recursive: true })
  data.projects.push(project)
  await writeNotesData(data)
  return withRootPath(project)
}

async function renameProject(id: string, name: string): Promise<NotesProject> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Notebook name is required')

  const data = await readNotesData()
  const project = data.projects.find((p) => p.id === id)
  if (!project) throw new Error(`No such notebook: ${id}`)

  project.name = trimmed
  await writeNotesData(data)
  return withRootPath(project)
}

async function deleteProject(id: string): Promise<void> {
  const data = await readNotesData()
  data.projects = data.projects.filter((p) => p.id !== id)
  await writeNotesData(data)
  try {
    await shell.trashItem(notebookDir(id))
  } catch {
    // Directory may already be gone; the index entry is what matters.
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
  ipcMain.handle('notes:listProjects', () => listProjects())
  ipcMain.handle('notes:createProject', (_e, name: string) => createProject(name))
  ipcMain.handle('notes:renameProject', (_e, id: string, name: string) => renameProject(id, name))
  ipcMain.handle('notes:deleteProject', (_e, id: string) => deleteProject(id))
  ipcMain.handle('notes:createNote', (_e, dirPath: string, name: string) => createNote(dirPath, name))
  ipcMain.handle('notes:createFolder', (_e, dirPath: string, name: string) => createFolder(dirPath, name))
  ipcMain.handle('notes:renameEntry', (_e, oldPath: string, newName: string, isNote: boolean) =>
    renameEntry(oldPath, newName, isNote)
  )
}
