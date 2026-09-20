import { IGNORED_SEGMENTS } from './ignoredSegments'
import type { SearchHit, SearchOptions } from './searchTypes'

export type { SearchBatch, SearchDone, SearchHit, SearchOptions } from './searchTypes'

const MAX_FILE_SIZE = '2M'
const MAX_TEXT_LENGTH = 300
const WINDOW_LEAD = 60

export function splitGlobs(input: string): string[] {
  return input.split(',').map((g) => g.trim()).filter(Boolean)
}

// Meant to run with cwd set to the project root. Searching "." instead of the
// absolute root matters: ripgrep matches anchored globs (`skip/**`) relative to
// the cwd it resolved, which silently stops matching if the root path goes
// through a symlink (e.g. /var -> /private/var). Callers re-join the root onto
// the "./"-relative paths in the output.
export function buildRgArgs(options: SearchOptions): string[] {
  const args = [
    '--json',
    '--no-config',
    '--hidden',
    '--no-require-git',
    '--no-ignore-parent',
    '--max-filesize', MAX_FILE_SIZE,
    options.caseSensitive ? '--case-sensitive' : '--ignore-case',
  ]
  if (options.wholeWord) args.push('--word-regexp')
  if (!options.regex) args.push('--fixed-strings')

  for (const segment of IGNORED_SEGMENTS) args.push('--glob', `!${segment}`)
  for (const glob of splitGlobs(options.include)) args.push('--glob', glob)
  for (const glob of splitGlobs(options.exclude)) args.push('--glob', `!${glob}`)

  args.push('-e', options.query, '--', '.')
  return args
}

interface RgSubmatch { start: number; end: number }

// ripgrep reports offsets in UTF-8 bytes; the rest of the app (Monaco, JS
// strings) counts UTF-16 code units.
function byteOffsetToUnits(buf: Buffer, byteOffset: number): number {
  return buf.subarray(0, byteOffset).toString('utf8').length
}

// Returns the hits for one `--json` output line, or null for anything that
// isn't a usable match (begin/end/summary messages, malformed JSON, paths that
// aren't valid UTF-8).
export function parseRgMessage(line: string): SearchHit[] | null {
  let message: any
  try {
    message = JSON.parse(line)
  } catch {
    return null
  }
  if (message?.type !== 'match') return null

  const data = message.data
  const path: string | undefined = data?.path?.text
  const rawLine: string | undefined = data?.lines?.text
  if (path === undefined || rawLine === undefined) return null

  const lineNumber: number = data.line_number
  const submatches: RgSubmatch[] = data.submatches ?? []
  const stripped = rawLine.replace(/\r?\n$/, '')
  const buf = Buffer.from(rawLine, 'utf8')

  const hits: SearchHit[] = []
  for (const sub of submatches) {
    const col0 = byteOffsetToUnits(buf, sub.start)
    const length = byteOffsetToUnits(buf, sub.end) - col0

    let text: string
    let matchStart: number
    if (stripped.length <= MAX_TEXT_LENGTH) {
      text = stripped
      matchStart = col0
    } else {
      const start = Math.max(0, col0 - WINDOW_LEAD)
      const end = start + MAX_TEXT_LENGTH
      text = (start > 0 ? '…' : '') + stripped.slice(start, end) + (end < stripped.length ? '…' : '')
      matchStart = col0 - start + (start > 0 ? 1 : 0)
    }

    const lead = text.length - text.trimStart().length
    text = text.trimStart()
    matchStart = Math.max(0, matchStart - lead)

    hits.push({
      path,
      line: lineNumber,
      col: col0 + 1,
      length: Math.min(length, Math.max(0, text.length - matchStart)),
      text,
      matchStart,
    })
  }
  return hits
}
