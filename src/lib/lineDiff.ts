import { diffLines, diffWordsWithSpace } from 'diff'

export type LineChangeType = 'added' | 'modified' | 'deleted'

export interface LineChange {
  type: LineChangeType
  startLine: number
  endLine: number
}

// A single contiguous run of characters within a "modified" line's NEW
// (current-buffer) text that differs from its OLD (HEAD) text. 1-based
// Monaco columns, endColumn exclusive - i.e. { startColumn: 3, endColumn: 6 }
// covers the 2nd, 3rd and 4th characters of the line, matching monaco.Range.
export interface InlineDiffRange {
  startColumn: number
  endColumn: number
}

export interface InlineLineDiff {
  line: number
  ranges: InlineDiffRange[]
}

export interface DiffResult {
  changes: LineChange[]
  inlineDiffs: InlineLineDiff[]
}

// diffLines treats a lone trailing-newline mismatch, or CRLF vs LF, as a
// real remove+add pair rather than equal content - normalizing both before
// diffing avoids flagging every line of a CRLF-checked-out file (or one
// whose HEAD blob lacks a final newline, common for config/lock files) as
// changed when nothing was actually edited. Only affects the diff input,
// not what's shown or written anywhere.
//
// Appends a trailing newline rather than stripping one: stripping only the
// outermost newline independently on each string shifts which line is
// "last" when one side has genuinely more content appended after (that line
// then compares its no-newline value against the other side's with-newline
// value and reads as changed even though only the append is new). Ensuring
// both sides always end in exactly one newline keeps every shared line's
// representation identical without touching mid-file alignment.
function normalizeForDiff(text: string): string {
  const lf = text.replace(/\r\n/g, '\n')
  return lf === '' || lf.endsWith('\n') ? lf : lf + '\n'
}

// Splits a diffLines part's `.value` back into its individual lines. Every
// part.value here is a run of whole lines each ending in '\n' (normalizeForDiff
// guarantees both diff inputs end in exactly one trailing newline, so every
// line - including the last - is newline-terminated), so split('\n') always
// leaves one trailing '' entry to drop.
function splitLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

// Word-level diff between one "modified" line's OLD (HEAD) text and NEW
// (current-buffer) text - powers the inline highlight layered on top of the
// gutter marker. Reuses the same `diff` package as the line-level diff below
// (Myers algorithm via diffWordsWithSpace, its word-granularity variant) so
// no extra dependency is needed; cost is bounded to this one line's length,
// never the whole file. Returns the runs of the NEW line not present at the
// same position in the OLD line, merging adjacent runs so consecutive
// word-level changes paint as one contiguous highlight instead of several
// abutting ones.
export function computeInlineRanges(oldLine: string, newLine: string): InlineDiffRange[] {
  if (oldLine === newLine) return []
  const parts = diffWordsWithSpace(oldLine, newLine)
  const ranges: InlineDiffRange[] = []
  let column = 1

  for (const part of parts) {
    if (part.removed) continue // consumes no column in the new line
    const length = part.value.length
    if (part.added) {
      const last = ranges[ranges.length - 1]
      if (last && last.endColumn === column) {
        last.endColumn = column + length
      } else {
        ranges.push({ startColumn: column, endColumn: column + length })
      }
    }
    column += length
  }

  return ranges
}

// Shared core for both computeLineChanges (gutter markers) and
// computeInlineDiffs (inline word-diff highlight): a single diffLines pass
// over the whole file, since both features are read off the very same line
// hunks and paying for that line-level diff twice per keystroke would be
// wasted work. Only 'modified' hunks (a removed run immediately followed by
// an added run) yield old/new line text pairs; added/removed/unchanged
// lines never reach computeInlineRanges above.
//
// A hunk's removed and added line counts aren't guaranteed equal (e.g. 2
// lines replaced by 4) - old/new lines are paired by index up to
// Math.min(oldLines.length, newLines.length); any extra new lines beyond
// that (no corresponding old line to diff against) still get the gutter's
// whole-hunk 'modified' marker but no inline highlight, same as they always
// have since inline highlighting is additive, not a replacement.
function diffContent(headContent: string, currentContent: string): DiffResult {
  const parts = diffLines(normalizeForDiff(headContent), normalizeForDiff(currentContent))
  const changes: LineChange[] = []
  const inlineDiffs: InlineLineDiff[] = []
  let currentLine = 1

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    if (!part.added && !part.removed) {
      currentLine += part.count ?? 0
      continue
    }

    if (part.removed) {
      const next = parts[i + 1]
      if (next?.added) {
        const oldLines = splitLines(part.value)
        const newLines = splitLines(next.value)
        changes.push({
          type: 'modified',
          startLine: currentLine,
          endLine: currentLine + newLines.length - 1,
        })
        const pairCount = Math.min(oldLines.length, newLines.length)
        for (let j = 0; j < pairCount; j++) {
          const ranges = computeInlineRanges(oldLines[j], newLines[j])
          if (ranges.length > 0) inlineDiffs.push({ line: currentLine + j, ranges })
        }
        currentLine += newLines.length
        i++
      } else {
        const boundaryLine = Math.max(currentLine - 1, 1)
        changes.push({ type: 'deleted', startLine: boundaryLine, endLine: boundaryLine })
      }
      continue
    }

    // Pure addition (a 'removed' part didn't already consume this one above)
    changes.push({
      type: 'added',
      startLine: currentLine,
      endLine: currentLine + (part.count ?? 0) - 1,
    })
    currentLine += part.count ?? 0
  }

  return { changes, inlineDiffs }
}

// Powers the editor's gutter change indicators: diffs the file's HEAD
// content against the live buffer and returns change regions in the
// buffer's own (current) line numbers - a pure removal has no line to
// attach to there, so it's marked as a single-line 'deleted' boundary
// at the line just above the gap (line 1 if the gap is at the very top),
// matching VS Code's convention.
export function computeLineChanges(headContent: string, currentContent: string): LineChange[] {
  return diffContent(headContent, currentContent).changes
}

// Powers the editor's inline word-diff highlight: for every line
// computeLineChanges already flags 'modified', the character range(s)
// within it that changed from HEAD. Call computeDiff instead when both the
// gutter markers and the inline highlight are needed from the same buffer
// snapshot (e.g. Editor.tsx's applyGutterDecorations) - it shares the one
// diffLines pass rather than paying for it twice.
export function computeInlineDiffs(headContent: string, currentContent: string): InlineLineDiff[] {
  return diffContent(headContent, currentContent).inlineDiffs
}

// Single entry point for callers that need both the gutter's line changes
// and the inline word-diff highlight from the same buffer snapshot - one
// diffLines pass instead of the two computeLineChanges/computeInlineDiffs
// would otherwise each run independently.
export function computeDiff(headContent: string, currentContent: string): DiffResult {
  return diffContent(headContent, currentContent)
}
