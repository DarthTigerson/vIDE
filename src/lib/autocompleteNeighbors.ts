// Snippets from the other files open in the editor, for the autocomplete
// model's extra context: the 30-line window of each file that shares the most
// names with the code around the cursor (how many of the cursor's names it
// covers; plain Jaccard is drowned out by a window's own unrelated names).
// Cheap enough to run per request: a few open files, scanned in steps of 10
// lines.

export interface NeighborChunk { filename: string; text: string }

const WINDOW_LINES = 30
const STEP_LINES = 10
const MAX_FILE_LINES = 3000
const MAX_FILES = 8
const MAX_CHUNKS = 3
const MAX_TOTAL_CHARS = 4000
// Half the cursor's names, and at least two of them: a loose match is noise
// the model copies from.
const MIN_SCORE = 0.5
const MIN_SHARED = 2

const IDENT = /[A-Za-z_$][\w$]*/g
const COMMON = new Set(['const', 'let', 'return', 'function', 'export', 'import', 'from', 'this', 'true', 'false', 'null', 'undefined', 'string', 'number', 'boolean', 'void', 'async', 'await', 'new', 'type', 'interface'])

function names(text: string): Set<string> {
  const out = new Set<string>()
  for (const name of text.match(IDENT) ?? []) if (name.length >= 3 && !COMMON.has(name)) out.add(name)
  return out
}

// Share of the cursor's names the window contains; among equal covers, the
// window with fewer names of its own (less noise) edges ahead.
function coverage(target: Set<string>, window: Set<string>): number {
  let shared = 0
  for (const name of target) if (window.has(name)) shared++
  return shared < Math.min(MIN_SHARED, target.size) ? 0 : shared / target.size - window.size / 1e6
}

// `cursorText` is the code just around the cursor (the last lines before it).
export function pickNeighborSnippets(cursorText: string, files: NeighborChunk[]): NeighborChunk[] {
  const target = names(cursorText)
  if (target.size === 0) return []
  const best: { filename: string; text: string; score: number }[] = []
  for (const file of files.slice(0, MAX_FILES)) {
    const lines = file.text.split('\n').slice(0, MAX_FILE_LINES)
    let top: { text: string; score: number } | null = null
    for (let start = 0; start < Math.max(1, lines.length - WINDOW_LINES + STEP_LINES); start += STEP_LINES) {
      const text = lines.slice(start, start + WINDOW_LINES).join('\n')
      const score = coverage(target, names(text))
      if (!top || score > top.score) top = { text, score }
    }
    if (top && top.score >= MIN_SCORE) best.push({ filename: file.filename, ...top })
  }
  best.sort((a, b) => b.score - a.score)
  const chunks: NeighborChunk[] = []
  let total = 0
  for (const { filename, text } of best) {
    if (chunks.length >= MAX_CHUNKS) break
    const clipped = text.slice(0, MAX_TOTAL_CHARS - total)
    if (!clipped) break
    chunks.push({ filename, text: clipped })
    total += clipped.length
  }
  return chunks
}
