// Logic the main-process ripgrep path and the renderer's in-memory matcher
// (for tabs with unsaved edits) must agree on exactly. Deliberately has no
// imports — see searchTypes.ts for why.

const MAX_TEXT_LENGTH = 300
const WINDOW_LEAD = 60

export function splitGlobs(input: string): string[] {
  return input.split(',').map((g) => g.trim()).filter(Boolean)
}

// Builds what the panel shows for one hit: the line trimmed of leading
// whitespace, and very long lines (minified bundles) windowed around the match
// so the match itself is never cut off. col0 is the 0-based UTF-16 offset of
// the match within `line`; matchStart indexes into the returned text.
export function makeDisplay(line: string, col0: number, length: number): { text: string; matchStart: number; length: number } {
  let text: string
  let matchStart: number
  if (line.length <= MAX_TEXT_LENGTH) {
    text = line
    matchStart = col0
  } else {
    const start = Math.max(0, col0 - WINDOW_LEAD)
    const end = start + MAX_TEXT_LENGTH
    text = (start > 0 ? '…' : '') + line.slice(start, end) + (end < line.length ? '…' : '')
    matchStart = col0 - start + (start > 0 ? 1 : 0)
  }

  const lead = text.length - text.trimStart().length
  text = text.trimStart()
  matchStart = Math.max(0, matchStart - lead)
  return { text, matchStart, length: Math.min(length, Math.max(0, text.length - matchStart)) }
}
