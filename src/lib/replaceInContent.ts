import { createReplacer } from './findInText'

export interface ReplaceOptions {
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  replacement: string
}

// A hit to replace, as reported by search: 1-based line, 1-based UTF-16 column.
export interface ReplaceTarget {
  line: number
  col: number
}

export interface ReplaceResult {
  content: string
  replaced: number
  // Targets that no longer match (the file changed since the search ran).
  skipped: number
  error?: string
}

// Replaces the match at each target position and nothing else.
//
// Each target is re-verified against the content as it is *now*: a sticky
// regex must match right at that column. Search results are deliberately
// static, so by the time someone presses Replace the file may have moved on —
// a target that no longer matches is skipped and counted, never overwritten
// blindly.
export function replaceInContent(content: string, targets: ReplaceTarget[], options: ReplaceOptions): ReplaceResult {
  if (targets.length === 0) return { content, replaced: 0, skipped: 0 }

  let replacer: ReturnType<typeof createReplacer>
  try {
    replacer = createReplacer(options)
  } catch (error) {
    return { content, replaced: 0, skipped: targets.length, error: (error as Error).message }
  }

  // Even indices are lines, odd indices the separators between them, so line
  // endings (CRLF or LF) survive untouched.
  const parts = content.split(/(\r?\n)/)

  // Right-to-left within a line so an earlier replacement never shifts the
  // columns of the ones still to do.
  const ordered = [...targets].sort((a, b) => a.line - b.line || b.col - a.col)

  let replaced = 0
  let skipped = 0
  let previous: ReplaceTarget | null = null
  for (const target of ordered) {
    if (previous && previous.line === target.line && previous.col === target.col) continue
    previous = target

    const index = (target.line - 1) * 2
    const line = parts[index]
    const replacement = line === undefined ? null : replacer(line, target.col)
    if (!replacement) { skipped++; continue }

    const at = target.col - 1
    parts[index] = line.slice(0, at) + replacement.text + line.slice(at + replacement.length)
    replaced++
  }

  return { content: parts.join(''), replaced, skipped }
}
