import { IGNORED_SEGMENTS } from '../../electron/ignoredSegments'
import { makeDisplay, splitGlobs } from '../../electron/searchShared'
import type { SearchHit } from '../../electron/searchTypes'

// Searches the in-memory content of a tab with unsaved edits, so the panel
// reports what is in the editor rather than what ripgrep sees on disk. Mirrors
// the flags handed to `rg` (see electron/searchArgs.ts) and shares its
// display-text logic, so both kinds of hit look identical in the panel.
//
// JS and Rust regex dialects differ at the edges (look-around, some escapes);
// that only affects files with unsaved edits and is accepted.

export interface InMemoryOptions {
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  include: string
  exclude: string
}

export interface InMemoryResult {
  hits: SearchHit[]
  error?: string
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildRegExp(options: InMemoryOptions): RegExp {
  const source = options.regex ? options.query : escapeRegExp(options.query)
  // Same meaning as rg --word-regexp: no word character directly on either
  // side (so `(needle)` matches, `my_needle` doesn't), which plain \b gets
  // wrong when the query itself starts or ends with punctuation.
  const wrapped = options.wholeWord ? `(?<!\\w)(?:${source})(?!\\w)` : source
  return new RegExp(wrapped, options.caseSensitive ? 'g' : 'gi')
}

export function searchInMemory(content: string, path: string, options: InMemoryOptions): InMemoryResult {
  if (!options.query) return { hits: [] }

  let re: RegExp
  try {
    re = buildRegExp(options)
  } catch (error) {
    return { hits: [], error: (error as Error).message }
  }

  const hits: SearchHit[] = []
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(line)) !== null) {
      if (match[0].length === 0) {
        re.lastIndex++ // an empty match is not a result; step past it
        continue
      }
      const display = makeDisplay(line, match.index, match[0].length)
      hits.push({
        path,
        line: i + 1,
        col: match.index + 1,
        length: display.length,
        text: display.text,
        matchStart: display.matchStart,
      })
    }
  }
  return { hits }
}

// Translates one gitignore-style glob (what `rg --glob` accepts) into a regex
// over root-relative, forward-slash paths. A pattern with no slash matches a
// name at any depth; one with a slash is anchored to the root. A match on a
// directory also covers everything beneath it.
export function globMatches(pattern: string, relPath: string): boolean {
  let glob = pattern
  const anchoredByLeadingSlash = glob.startsWith('/')
  if (anchoredByLeadingSlash) glob = glob.slice(1)
  if (glob.endsWith('/')) glob = glob.slice(0, -1)
  const anchored = anchoredByLeadingSlash || glob.includes('/')

  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        const atStart = i === 0 || glob[i - 1] === '/'
        if (atStart && glob[i + 2] === '/') { out += '(?:.*/)?'; i += 2 }
        else { out += '.*'; i += 1 }
      } else {
        out += '[^/]*'
      }
    } else if (c === '?') {
      out += '[^/]'
    } else if (c === '[') {
      const close = glob.indexOf(']', i + 1)
      if (close === -1) { out += '\\['; continue }
      let body = glob.slice(i + 1, close)
      if (body.startsWith('!')) body = '^' + body.slice(1)
      out += `[${body}]`
      i = close
    } else if (c === '{') {
      const close = glob.indexOf('}', i + 1)
      if (close === -1) { out += '\\{'; continue }
      out += `(?:${glob.slice(i + 1, close).split(',').map(escapeRegExp).join('|')})`
      i = close
    } else {
      out += escapeRegExp(c)
    }
  }

  const re = new RegExp(`${anchored ? '^' : '(?:^|/)'}${out}(?:/.*)?$`)
  return re.test(relPath)
}

// Whether ripgrep would have considered this file at all, given the panel's
// include/exclude fields and the always-on ignored directories. (Does not know
// about .gitignore; a gitignored file with unsaved edits is still searched.)
export function pathAllowed(absPath: string, root: string, include: string, exclude: string): boolean {
  const prefix = root.replace(/\/$/, '') + '/'
  if (!absPath.startsWith(prefix)) return false
  const rel = absPath.slice(prefix.length)

  if (rel.split('/').some((segment) => IGNORED_SEGMENTS.has(segment))) return false

  const includes = splitGlobs(include)
  if (includes.length > 0 && !includes.some((g) => globMatches(g, rel))) return false
  if (splitGlobs(exclude).some((g) => globMatches(g, rel))) return false
  return true
}
