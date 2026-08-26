import { join, relative, extname, dirname } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { readdirSync, statSync } from 'fs'
import type { McpToolDef } from './protocol'

function notesRoot(dataDir: string): string {
  return join(dataDir, 'notes')
}

// Resolve a relative path safely inside the notes root. Throws if the
// resolved path escapes the root (path traversal guard).
function resolveSafe(dataDir: string, relPath: string): string {
  const root = notesRoot(dataDir)
  const resolved = join(root, relPath)
  if (!resolved.startsWith(root + '/') && resolved !== root) {
    throw new Error(`Path "${relPath}" escapes the notes root`)
  }
  return resolved
}

interface NoteEntry {
  path: string // relative to notes root, e.g. "folder/note.md"
  isFolder: boolean
}

function walkNotes(dir: string, root: string): NoteEntry[] {
  const entries: NoteEntry[] = []
  let items: string[]
  try {
    items = readdirSync(dir)
  } catch {
    return entries
  }
  for (const item of items.sort()) {
    const full = join(dir, item)
    let stat
    try {
      stat = statSync(full)
    } catch {
      continue
    }
    const rel = relative(root, full)
    if (stat.isDirectory()) {
      entries.push({ path: rel, isFolder: true })
      entries.push(...walkNotes(full, root))
    } else if (extname(item) === '.md') {
      entries.push({ path: rel, isFolder: false })
    }
  }
  return entries
}

export function buildNotesTools(dataDir: string): McpToolDef[] {
  return [
    {
      name: 'list_notes',
      description:
        "List all notes (and folders) in the user's vIDE notes library. Returns relative paths.",
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const root = notesRoot(dataDir)
        const entries = walkNotes(root, root)
        if (!entries.length) return 'No notes yet.'
        return entries.map((e) => (e.isFolder ? `[folder] ${e.path}` : e.path)).join('\n')
      },
    },
    {
      name: 'read_note',
      description:
        'Read the full content of a note by its relative path (e.g. "folder/my-note.md"). Use list_notes to discover paths.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
      handler: async (args) => {
        const abs = resolveSafe(dataDir, String(args.path))
        const content = await readFile(abs, 'utf-8')
        return content || '(empty note)'
      },
    },
    {
      name: 'search_notes',
      description:
        'Search the content of all notes for a query string (case-insensitive substring match). Returns matching note paths with the first matching line.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
      handler: async (args) => {
        const query = String(args.query ?? '').toLowerCase()
        const root = notesRoot(dataDir)
        const entries = walkNotes(root, root).filter((e) => !e.isFolder)
        const results: string[] = []
        for (const entry of entries) {
          const abs = join(root, entry.path)
          let text: string
          try {
            text = await readFile(abs, 'utf-8')
          } catch {
            continue
          }
          if (text.toLowerCase().includes(query)) {
            const line = text.split('\n').find((l) => l.toLowerCase().includes(query)) ?? ''
            results.push(`${entry.path}: ${line.trim()}`)
          }
          if (results.length >= 25) break
        }
        return results.length ? results.join('\n') : 'No matches found.'
      },
    },
    {
      name: 'write_note',
      description:
        'Create or overwrite a note with the given content. The path is relative to the notes root (e.g. "ideas/roadmap.md"). Missing parent folders are created automatically.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
      handler: async (args) => {
        const rel = String(args.path).endsWith('.md')
          ? String(args.path)
          : String(args.path) + '.md'
        const abs = resolveSafe(dataDir, rel)
        await mkdir(dirname(abs), { recursive: true })
        await writeFile(abs, String(args.content ?? ''), 'utf-8')
        return `Saved ${rel}`
      },
    },
  ]
}
