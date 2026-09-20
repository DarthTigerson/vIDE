import { buildRegExp } from './searchInMemory'

// Matching used by the in-editor find box. Same rules as the sidebar search
// (case / whole word / regex, via buildRegExp), but returns exact match ranges
// instead of display text.

export interface FindOptions {
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
}

// 1-based line, 1-based UTF-16 column (Monaco's unit).
export interface FindMatch {
  line: number
  col: number
  length: number
}

export interface FindResult {
  matches: FindMatch[]
  truncated: boolean
  error?: string
}

export interface Replacement {
  // Length of the match being replaced, and the text it becomes.
  length: number
  text: string
}

export const DEFAULT_MATCH_LIMIT = 10_000

export function findMatches(content: string, options: FindOptions, limit = DEFAULT_MATCH_LIMIT): FindResult {
  if (!options.query) return { matches: [], truncated: false }

  let re: RegExp
  try {
    re = buildRegExp(options)
  } catch (error) {
    return { matches: [], truncated: false, error: (error as Error).message }
  }

  const matches: FindMatch[] = []
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(lines[i])) !== null) {
      if (match[0].length === 0) { re.lastIndex++; continue }
      if (matches.length >= limit) return { matches, truncated: true }
      matches.push({ line: i + 1, col: match.index + 1, length: match[0].length })
    }
  }
  return { matches, truncated: false }
}

// Builds a function giving what the match at (line text, column) becomes, or
// null if there is no longer a match exactly there (the text changed). The
// regex is compiled once, so replacing thousands of matches stays cheap.
// Throws if the query is an invalid regex.
export function createReplacer(options: FindOptions & { replacement: string }): (line: string, col: number) => Replacement | null {
  const base = buildRegExp(options)
  const sticky = new RegExp(base.source, base.flags.replace('g', '') + 'y')

  return (line, col) => {
    const at = col - 1
    if (at < 0 || at >= line.length) return null

    sticky.lastIndex = at
    const match = sticky.exec(line)
    if (!match || match[0].length === 0) return null

    if (!options.regex) return { length: match[0].length, text: options.replacement }

    // String replacement so $1 / $& / $<name> expand. The sticky regex replaces
    // only the match at `at`, with the whole line as context (look-around works).
    sticky.lastIndex = at
    const replaced = line.replace(sticky, options.replacement)
    const tail = line.length - (at + match[0].length)
    return { length: match[0].length, text: replaced.slice(at, replaced.length - tail) }
  }
}

export function replacementFor(line: string, col: number, options: FindOptions & { replacement: string }): Replacement | null {
  try {
    return createReplacer(options)(line, col)
  } catch {
    return null
  }
}
