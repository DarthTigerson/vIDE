import { readFile, stat } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import type { ExtraChunk } from './infill'

// Definitions of what the code at the cursor uses, looked up in the
// project's graphify graph (graphify-out/graph.json): a small model guesses
// names and argument orders, and the definition in another file is exactly
// what it can't see. Optional: a project without a graph gets nothing extra.

const MAX_SYMBOLS = 4
const MAX_CHUNKS = 6
const MAX_CHUNK_CHARS = 1500
const MAX_TOTAL_CHARS = 4000
const MAX_TYPE_LINES = 40
const PREFIX_LINES = 15
const SUFFIX_LINES = 3

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break',
  'continue', 'new', 'this', 'true', 'false', 'null', 'undefined', 'typeof', 'instanceof', 'in', 'of', 'async',
  'await', 'export', 'import', 'from', 'default', 'class', 'extends', 'interface', 'type', 'enum', 'string',
  'number', 'boolean', 'void', 'any', 'unknown', 'never', 'try', 'catch', 'finally', 'throw', 'get', 'set',
])

interface Definition { file: string; line: number }
interface Index { mtimeMs: number; root: string; byName: Map<string, Definition[]> }

const IDENT = /[A-Za-z_$][\w$]*/g

// Names nearest the cursor first: the line being typed matters most.
function namesNearCursor(prefix: string, suffix: string): string[] {
  const before = prefix.split('\n').slice(-PREFIX_LINES).reverse()
  const after = suffix.split('\n').slice(0, SUFFIX_LINES)
  const seen = new Set<string>()
  for (const line of [...before, ...after]) {
    const names = line.match(IDENT) ?? []
    for (const name of names.reverse()) {
      if (name.length >= 3 && !KEYWORDS.has(name)) seen.add(name)
    }
  }
  return [...seen]
}

// Local name → exported name for everything the file imports by name
// (`import { a, b as c, type D } from …`, `import X from …`). Only these are
// looked up: a name the file imports is certainly from another file and in
// use, while any name near the cursor often matched an unrelated definition
// the model then copied from.
function importedNames(source: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of source.matchAll(/import\s+(?:type\s+)?([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?\s*from\s+['"][^'"]+['"]/g)) {
    if (m[1] && m[1] !== 'type') out.set(m[1], m[1])
    for (const part of (m[2] ?? '').split(',')) {
      const spec = part.trim().replace(/^type\s+/, '')
      const [exported, local] = spec.split(/\s+as\s+/)
      if (exported) out.set((local ?? exported).trim(), exported.trim())
    }
  }
  return out
}

// Functions: the signature line(s) up to the opening brace. Types, interfaces
// and enums: the whole declaration, capped.
function snippetAt(lines: string[], start: number): string {
  const first = lines[start] ?? ''
  const whole = /\b(interface|type|enum|class)\b/.test(first)
  const out: string[] = []
  let depth = 0
  let opened = false
  for (let i = start; i < lines.length && out.length < MAX_TYPE_LINES; i++) {
    const line = lines[i]
    out.push(line)
    for (const ch of line) {
      if (ch === '{' || ch === '(' || ch === '[') { depth++; opened = true }
      else if (ch === '}' || ch === ')' || ch === ']') depth--
    }
    if (!whole) {
      if (/[{=]\s*$/.test(line) || /=>\s*\(?\{?\s*$/.test(line) || (opened && depth <= 0)) break
    } else if (opened && depth <= 0) {
      break
    }
  }
  return out.join('\n').slice(0, MAX_CHUNK_CHARS)
}

export class GraphContext {
  private indexes = new Map<string, Index>()
  private roots = new Map<string, string | null>()
  private files = new Map<string, { mtimeMs: number; lines: string[] }>()

  private async findRoot(dir: string): Promise<string | null> {
    if (this.roots.has(dir)) return this.roots.get(dir)!
    let found: string | null = null
    for (let d = dir; ; d = dirname(d)) {
      if (await stat(join(d, 'graphify-out', 'graph.json')).then(() => true, () => false)) { found = d; break }
      if (dirname(d) === d) break
    }
    this.roots.set(dir, found)
    return found
  }

  private async index(root: string): Promise<Index | null> {
    const path = join(root, 'graphify-out', 'graph.json')
    const info = await stat(path).catch(() => null)
    if (!info) return null
    const cached = this.indexes.get(root)
    if (cached && cached.mtimeMs === info.mtimeMs) return cached
    try {
      const graph = JSON.parse(await readFile(path, 'utf8')) as { nodes?: { label?: string; source_file?: string; source_location?: string; file_type?: string }[] }
      // Only name → file:line is kept; the parsed graph itself is dropped.
      const byName = new Map<string, Definition[]>()
      for (const n of graph.nodes ?? []) {
        if (n.file_type !== 'code' || !n.label || !n.source_file) continue
        const name = n.label.replace(/\(\)$/, '')
        const line = Number(/^L(\d+)/.exec(n.source_location ?? '')?.[1])
        if (!/^[A-Za-z_$][\w$]*$/.test(name) || !line) continue
        const defs = byName.get(name) ?? []
        defs.push({ file: n.source_file, line })
        byName.set(name, defs)
      }
      const index = { mtimeMs: info.mtimeMs, root, byName }
      this.indexes.set(root, index)
      return index
    } catch {
      return null
    }
  }

  private async lines(path: string): Promise<string[] | null> {
    const info = await stat(path).catch(() => null)
    if (!info) return null
    const cached = this.files.get(path)
    if (cached && cached.mtimeMs === info.mtimeMs) return cached.lines
    const lines = (await readFile(path, 'utf8').catch(() => null))?.split('\n') ?? null
    if (!lines) return null
    if (this.files.size >= 64) this.files.delete(this.files.keys().next().value!)
    this.files.set(path, { mtimeMs: info.mtimeMs, lines })
    return lines
  }

  async chunksFor(filePath: string, prefix: string, suffix: string): Promise<ExtraChunk[]> {
    const root = await this.findRoot(dirname(filePath))
    if (!root) return []
    const index = await this.index(root)
    if (!index) return []
    const current = relative(root, filePath)

    const chunks: ExtraChunk[] = []
    const used = new Set<string>()
    let total = 0
    const add = async (name: string): Promise<string | null> => {
      const defs = (index.byName.get(name) ?? []).filter((d) => d.file !== current)
      // An ambiguous name could send the wrong definition; better none.
      if (defs.length !== 1) return null
      const key = `${defs[0].file}:${defs[0].line}`
      if (used.has(key)) return null
      const lines = await this.lines(join(root, defs[0].file))
      if (!lines) return null
      const text = snippetAt(lines, defs[0].line - 1)
      if (!text.trim() || total + text.length > MAX_TOTAL_CHARS) return null
      used.add(key)
      total += text.length
      chunks.push({ filename: defs[0].file, text })
      return text
    }

    // The saved file's imports, plus any in the prefix (a new import not saved yet).
    const imported = importedNames(`${(await this.lines(filePath))?.join('\n') ?? ''}\n${prefix}`)
    let symbols = 0
    for (const local of namesNearCursor(prefix, suffix)) {
      if (symbols >= MAX_SYMBOLS || chunks.length >= MAX_CHUNKS) break
      const name = imported.get(local)
      if (!name) continue
      const text = await add(name)
      if (!text) continue
      symbols++
      // One hop: the type a value is declared with (create<EditorState>).
      const firstLine = text.split('\n')[0]
      for (const typeName of firstLine.match(/\b[A-Z][\w$]*/g) ?? []) {
        if (typeName !== name && chunks.length < MAX_CHUNKS) await add(typeName)
      }
    }
    return chunks
  }
}
