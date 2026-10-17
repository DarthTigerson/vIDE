import {
  readdir, readFile, stat, access, cp,
  writeFile as fsWriteFile, mkdir as fsMkdir, rename as fsRename,
} from 'fs/promises'
import { join, extname, basename, dirname, relative, resolve, isAbsolute } from 'path'
import { homedir } from 'os'
import { shell } from 'electron'
import { IGNORED_SEGMENTS } from './ignoredSegments'

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
}

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  createdMs?: number
  updatedMs?: number
}

export interface SearchMatch {
  path: string
  line: number
  col: number
  text: string
}

const BINARY_EXTENSIONS = new Set([
  '.zip', '.tar', '.gz', '.tgz', '.bz2', '.7z', '.rar', '.xz',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.webp', '.avif',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flac', '.ogg', '.wav',
  '.exe', '.dll', '.so', '.dylib', '.a', '.o', '.wasm',
  '.ttf', '.woff', '.woff2', '.eot',
  '.pyc', '.pyo', '.class',
  '.bin', '.dat', '.db', '.sqlite', '.sqlite3',
])

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2 MB
const MAX_LINE_LENGTH = 300
const MAX_MATCHES = 150

export async function listAllFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const results: string[] = []
  for (const entry of entries) {
    if (IGNORED_SEGMENTS.has(entry.name)) continue
    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      const children = await listAllFiles(fullPath)
      results.push(...children)
    } else {
      results.push(fullPath)
    }
  }
  return results
}

export async function searchText(root: string, query: string, caseSensitive: boolean): Promise<SearchMatch[]> {
  const allFiles = await listAllFiles(root)
  const results: SearchMatch[] = []
  const needle = caseSensitive ? query : query.toLowerCase()

  for (const filePath of allFiles) {
    if (results.length >= MAX_MATCHES) break

    if (BINARY_EXTENSIONS.has(extname(filePath).toLowerCase())) continue

    try {
      const info = await stat(filePath)
      if (info.size > MAX_FILE_SIZE) continue

      const content = await readFile(filePath, 'utf-8')
      if (content.includes('\0')) continue // binary file detected by null bytes

      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const raw = lines[i]
        const haystack = caseSensitive ? raw : raw.toLowerCase()
        const col = haystack.indexOf(needle)
        if (col !== -1) {
          const text = raw.length > MAX_LINE_LENGTH ? raw.slice(0, MAX_LINE_LENGTH) + '…' : raw
          results.push({ path: filePath, line: i + 1, col: col + 1, text })
          if (results.length >= MAX_MATCHES) break
        }
      }
    } catch {
      // skip unreadable files
    }
  }
  return results
}

export async function buildTree(dirPath: string): Promise<FileNode[]> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  return entries
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory())
        return a.isDirectory() ? -1 : 1
      // numeric: digit runs compare by value, so 0.1.3 sorts before 0.1.21.
      return a.name.localeCompare(b.name, undefined, { numeric: true })
    })
    .map((e) => ({
      name: e.name,
      path: join(dirPath, e.name),
      isDirectory: e.isDirectory(),
    }))
}

// buildTree plus each entry's file dates, for the Notes panel's Created/
// Updated sorts (kept out of buildTree so the file tree doesn't pay for a
// stat per entry). birthtime is 0 where the filesystem doesn't record it;
// the modified time stands in then.
export async function buildTreeWithDates(dirPath: string): Promise<FileNode[]> {
  const nodes = await buildTree(dirPath)
  return Promise.all(
    nodes.map(async (node) => {
      try {
        const info = await stat(node.path)
        return { ...node, createdMs: info.birthtimeMs || info.mtimeMs, updatedMs: info.mtimeMs }
      } catch {
        return node
      }
    })
  )
}

export async function readImageDataUrl(filePath: string): Promise<string> {
  const mime = IMAGE_MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  const buffer = await readFile(filePath)
  return `data:${mime};base64,${buffer.toString('base64')}`
}

// Extracted from electron/main.ts's registerFsHandlers() inline ipcMain
// closures (same logic, byte-for-byte) so the mobile relay can delegate to
// the same functions the desktop IPC handlers use.

export function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf-8')
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export function getHomeDir(): string {
  return homedir()
}

export function writeFile(path: string, content: string): Promise<void> {
  return fsWriteFile(path, content, 'utf-8')
}

export function mkdir(path: string): Promise<void> {
  return fsMkdir(path, { recursive: false })
}

export function renamePath(from: string, to: string): Promise<void> {
  return fsRename(from, to)
}

export function trashPath(path: string): Promise<void> {
  return shell.trashItem(path)
}

// Finder-style unique name inside destDir: "a.txt" -> "a copy.txt" ->
// "a copy 2.txt". Directories have no extension (so "v1.2" -> "v1.2 copy").
export async function uniqueDestPath(destDir: string, name: string, isDirectory: boolean): Promise<string> {
  const plain = join(destDir, name)
  if (!(await pathExists(plain))) return plain
  const ext = isDirectory ? '' : extname(name)
  const stem = ext ? name.slice(0, -ext.length) : name
  let candidate = join(destDir, `${stem} copy${ext}`)
  for (let n = 2; await pathExists(candidate); n++) {
    candidate = join(destDir, `${stem} copy ${n}${ext}`)
  }
  return candidate
}

function assertNotIntoSelf(source: string, destDir: string): void {
  const rel = relative(resolve(source), resolve(destDir))
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new Error(`Cannot put "${basename(source)}" into itself`)
  }
}

export async function copyInto(source: string, destDir: string): Promise<string> {
  assertNotIntoSelf(source, destDir)
  const info = await stat(source)
  const dest = await uniqueDestPath(destDir, basename(source), info.isDirectory())
  await cp(source, dest, { recursive: true, errorOnExist: true, force: false })
  return dest
}

export async function moveInto(source: string, destDir: string): Promise<string> {
  assertNotIntoSelf(source, destDir)
  if (dirname(resolve(source)) === resolve(destDir)) return source
  const info = await stat(source)
  const dest = await uniqueDestPath(destDir, basename(source), info.isDirectory())
  await fsRename(source, dest)
  return dest
}

export function revealInFinder(path: string): void {
  shell.showItemInFolder(path)
}
