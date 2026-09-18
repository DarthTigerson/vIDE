import { diffLines } from 'diff'

export type LineChangeType = 'added' | 'modified' | 'deleted'

export interface LineChange {
  type: LineChangeType
  startLine: number
  endLine: number
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
export function normalizeForDiff(text: string): string {
  const lf = text.replace(/\r\n/g, '\n')
  return lf === '' || lf.endsWith('\n') ? lf : lf + '\n'
}

// Powers the editor's gutter change indicators: diffs the file's HEAD
// content against the live buffer and returns change regions in the
// buffer's own (current) line numbers - a pure removal has no line to
// attach to there, so it's marked as a single-line 'deleted' boundary
// at the line just above the gap (line 1 if the gap is at the very top),
// matching VS Code's convention.
export function computeLineChanges(headContent: string, currentContent: string): LineChange[] {
  const parts = diffLines(normalizeForDiff(headContent), normalizeForDiff(currentContent))
  const changes: LineChange[] = []
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
        changes.push({
          type: 'modified',
          startLine: currentLine,
          endLine: currentLine + (next.count ?? 0) - 1,
        })
        currentLine += next.count ?? 0
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

  return changes
}
