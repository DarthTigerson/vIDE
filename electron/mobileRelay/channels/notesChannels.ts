import { registerChannel } from '../dispatch'
import { app } from 'electron'
import { basename, join, dirname } from 'path'
import { access, mkdir, readFile, readdir, rename, writeFile } from 'fs/promises'

function notesRoot(): string {
  return join(app.getPath('userData'), 'notes')
}

async function ensureNotesRoot(): string {
  const root = notesRoot()
  await mkdir(root, { recursive: true })
  return root
}

function sanitizeEntryName(raw: string): string {
  const name = raw.trim()
  if (!name) throw new Error('Name is required')
  if (name === '.' || name === '..') throw new Error('Invalid name')
  if (/[/\\]/.test(name)) throw new Error('Name cannot contain / or \\')
  if (name.split('').some((ch) => ch.charCodeAt(0) < 0x20)) throw new Error('Name contains invalid characters')
  return name
}

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

async function renameEntry(oldPath: string, newName: string, isNote: boolean): Promise<{ path: string; name: string }> {
  const dir = dirname(oldPath)
  const finalName = isNote ? forceMdExtension(sanitizeEntryName(newName)) : sanitizeEntryName(newName)
  const newPath = join(dir, finalName)
  await rename(oldPath, newPath)
  return { path: newPath, name: finalName }
}

async function searchNotes(root: string, query: string): Promise<string[]> {
  const results: string[] = []

  async function search(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          await search(fullPath)
        } else if (entry.name.endsWith('.md')) {
          const content = await readFile(fullPath, 'utf-8')
          if (content.toLowerCase().includes(query.toLowerCase())) {
            results.push(fullPath)
          }
        }
      }
    } catch (err) {
      // ignore errors for individual directories
    }
  }

  await search(root)
  return results
}

export function registerNotesRelayChannels(): void {
  registerChannel('notes:getRoot', async () => ensureNotesRoot())
  registerChannel('notes:createNote', (dirPath: string, name: string) => createNote(dirPath, name))
  registerChannel('notes:createFolder', (dirPath: string, name: string) => createFolder(dirPath, name))
  registerChannel('notes:renameEntry', (oldPath: string, newName: string, isNote: boolean) =>
    renameEntry(oldPath, newName, isNote))
  registerChannel('notes:search', (query: string) => searchNotes(notesRoot(), query))
}
