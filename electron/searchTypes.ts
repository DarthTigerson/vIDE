// Shared by the main process and (via src/types/api.d.ts) the renderer.
// Deliberately has no imports: the web tsconfig compiles whatever api.d.ts
// pulls in, so anything imported from here would have to be web-listed too.

export interface SearchOptions {
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  // Comma-separated globs, as typed into the panel's include/exclude fields.
  include: string
  exclude: string
  // Absolute paths whose on-disk content must not be reported — files with
  // unsaved edits, which the renderer searches from memory instead.
  skipPaths: string[]
}

export interface SearchHit {
  path: string
  line: number
  // 1-based UTF-16 column of the match in the real file (Monaco's unit).
  col: number
  length: number
  // Display text: CRLF stripped, leading whitespace trimmed, and very long
  // lines windowed around the match. matchStart indexes into this text.
  text: string
  matchStart: number
}

export interface SearchBatch {
  searchId: string
  hits: SearchHit[]
}

export interface SearchDone {
  searchId: string
  fileCount: number
  matchCount: number
  truncated: boolean
  error?: string
}
