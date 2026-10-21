import type { Terminal, ILink, ILinkProvider } from '@xterm/xterm'
import { useEditorStore } from '@/stores/editorStore'
import { useBrowserStore } from '@/stores/browserStore'
import { useFileStore } from '@/stores/fileStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useStatusMessageStore } from '@/stores/statusMessageStore'
import { toRelativePath } from '@/lib/sendSelectionToAssistant'
import { openFileAtLocation } from '@/lib/openFileLocation'
import { buildBrowserPath } from '@/components/Settings/paths'
import { buildGitDiffPath } from '@/components/Git/paths'

export interface ParsedFileLink {
  path: string
  line?: number
  col?: number
}

// Requires at least one directory separator (e.g. "src/App.tsx" or
// "~/.ssh/id_ed25519") rather than matching bare filenames — Claude's own
// file references always include one, and this alone is what keeps ordinary
// prose ("e.g.", "v1.2.3") from matching (neither contains a slash). The
// final segment deliberately has no required extension: real files are
// routinely extensionless (SSH keys, Makefile, LICENSE, dotfiles), and
// requiring one would silently exclude them rather than just risk an
// occasional stray "word/word" false match — click-time existence checking
// (see createFilePathActivateHandler) is the actual backstop for those, so
// this only needs to be a reasonable filter, not a perfect one. POSIX paths
// only, matching this app's platform support (macOS/Linux, no Windows) — no
// drive-letter handling.
export const FILE_PATH_REGEX =
  /(?:~\/|\.{1,2}\/|\/)?(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+(?::\d+(?::\d+)?)?/

export function parseFileLink(matchedText: string): ParsedFileLink {
  const [path, line, col] = matchedText.split(':')
  return {
    path,
    line: line ? Number(line) : undefined,
    col: col ? Number(col) : undefined,
  }
}

export function resolveFileLinkPath(rawPath: string, projectRoot: string, homeDir: string | null): string {
  if (rawPath.startsWith('/')) return rawPath
  if (rawPath.startsWith('~/') && homeDir) return `${homeDir.replace(/\/$/, '')}${rawPath.slice(1)}`
  return `${projectRoot.replace(/\/$/, '')}/${rawPath}`
}

// Multi-repo projects: Claude's tool headers print paths relative to the repo
// it ran in (e.g. "helm-charts/x.yaml" for a file inside "kustomize-bases/"),
// not the project root, so the plain project-root join misses them. Tries
// every known repo in parallel, preferring the selected one, then the rest in
// discovery order. Only for project-relative paths: absolute and ~/ paths
// already resolve unambiguously.
export async function resolveInKnownRepos(rawPath: string): Promise<string | null> {
  if (rawPath.startsWith('/') || rawPath.startsWith('~/')) return null
  const { repos, selectedRepo } = useGitReposStore.getState()
  const ordered = selectedRepo && repos.includes(selectedRepo)
    ? [selectedRepo, ...repos.filter((r) => r !== selectedRepo)]
    : repos
  const candidates = ordered.map((repo) => resolveFileLinkPath(rawPath, repo, null))
  const exists = await Promise.all(candidates.map((c) => window.api.pathExists(c)))
  return candidates.find((_, i) => exists[i]) ?? null
}

// Only meaningful for files inside the open project that actually have
// uncommitted changes — otherwise there's nothing to diff, so callers should
// fall back to opening the file in the editor instead.
async function resolveDiffTabPath(absPath: string, projectRoot: string): Promise<string | null> {
  const repoRoot = useGitReposStore.getState().resolveRepoForPath(absPath)
  if (!repoRoot) return null // outside any known repo

  const relPath = toRelativePath(absPath, repoRoot)
  const status = await window.api.gitStatus(repoRoot)
  if (status.unstaged.some((f) => f.path === relPath)) return buildGitDiffPath(repoRoot, relPath, false)
  if (status.staged.some((f) => f.path === relPath)) return buildGitDiffPath(repoRoot, relPath, true)
  return null
}

// A single dot-separated label, e.g. "github" or "co" in "github.com" —
// requires alnum/hyphen chars, no leading/trailing hyphen, and (critically)
// no leading dot, so a dotfile directory like ".ssh" is never mistaken for a
// domain label.
const DOMAIN_LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?'
const DOMAIN_LIKE_REGEX = new RegExp(`^${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})+$`)

// FILE_PATH_REGEX has no scheme requirement, so prose like "go to
// github.com/settings/ssh/new" satisfies it just as much as a real relative
// path does — there's no reliable way to tell those apart at detection time
// without false-negativing real files. Instead, checked only once the
// resolved path has already failed to exist on disk: does the text before
// the first slash look like a hostname (contains a dot, valid label shape),
// and isn't itself an absolute/home-relative/dotfile-style path (which are
// never domains). If so, it almost certainly was meant as a URL.
export function looksLikeBareDomain(rawPath: string): boolean {
  if (rawPath.startsWith('/') || rawPath.startsWith('~') || rawPath.startsWith('.')) return false
  return DOMAIN_LIKE_REGEX.test(rawPath.split('/')[0])
}

// Plain click opens the file in the editor (optionally jumping to a line/col
// if the matched text included one); Cmd/Ctrl+click views its diff instead,
// falling back to the editor if the file has no changes to diff. If it isn't
// a real file but reads as a bare domain (no http(s):// prefix, so it was
// never going to be caught by the URL provider), opens it as a URL instead.
export function createFilePathActivateHandler() {
  return async (event: MouseEvent, matchedText: string): Promise<void> => {
    const projectRoot = useFileStore.getState().projectRoot
    if (!projectRoot) return

    const { path: rawPath, line, col } = parseFileLink(matchedText)
    const homeDir = rawPath.startsWith('~/') ? await window.api.getHomeDir() : null
    let absPath = resolveFileLinkPath(rawPath, projectRoot, homeDir)
    if (!(await window.api.pathExists(absPath))) {
      const repoPath = await resolveInKnownRepos(rawPath)
      if (!repoPath) {
        // Previously a silent no-op, which read as "links are broken".
        if (looksLikeBareDomain(rawPath)) openUrlInBrowserTab(`https://${rawPath}`)
        else useStatusMessageStore.getState().show(`File not found: ${rawPath}`)
        return
      }
      absPath = repoPath
    }

    if (event.metaKey || event.ctrlKey) {
      const diffPath = await resolveDiffTabPath(absPath, projectRoot)
      if (diffPath) {
        useEditorStore.getState().openTab({ path: diffPath, content: '', dirty: false })
        return
      }
    }
    await openFileAtLocation(absPath, line, col)
  }
}

// Opens the URL in a new tab of vIDE's own Browser panel — never an
// external/OS browser — mirroring how App.tsx's openTodo() seeds a specific
// URL into a fresh browser tab.
export function openUrlInBrowserTab(uri: string): void {
  const id = Date.now().toString(36)
  useBrowserStore.getState().ensureTab(id, uri)
  useEditorStore.getState().openTab({ path: buildBrowserPath(id), content: '', dirty: false })
}

export function createUrlActivateHandler() {
  return (_event: MouseEvent, uri: string): void => openUrlInBrowserTab(uri)
}

// Maps a JS string index within a buffer line's plain text back to a 1-based
// terminal column, walking real cells (not raw string indices) so preceding
// wide characters — CJK text, emoji, xterm's own box-drawing/bullet prefixes
// in Claude's UI — don't throw off the column count. Mirrors the position-
// mapping @xterm/addon-web-links does internally (see the note on
// createWrappedLinkProvider below for why we can't just reuse that addon).
function columnForStringIndex(terminal: Terminal, line: BufferLine, strIndex: number): number {
  const cell = terminal.buffer.active.getNullCell()
  let consumed = 0
  for (let col = 0; col < line.length; col++) {
    if (consumed >= strIndex) return col + 1
    const c = line.getCell(col, cell)
    if (!c) break
    if (c.getWidth() === 0) continue // second half of a wide character
    consumed += c.getChars().length || 1
  }
  return line.length + 1
}

type BufferLine = NonNullable<ReturnType<Terminal['buffer']['active']['getLine']>>

// Same pattern @xterm/addon-web-links uses by default.
export const URL_REGEX = /(https?|HTTPS?):[/]{2}[^\s"'!*(){}|\\\^<>`]*[^\s"':,.!?{}|\\\^~\[\]`()<>]/

// Claude Code wraps its own output with real newlines (not xterm soft
// wraps), so a long URL/path becomes several unrelated buffer rows. A row is
// treated as continuing onto the next when its text runs to (nearly) the
// right edge with no trailing space, i.e. a token was cut mid-way.
const HARD_WRAP_EDGE_SLACK = 2
const MAX_JOINED_ROWS = 12

interface RowSegment {
  y: number // 0-based buffer row
  line: BufferLine
  offset: number // start index within the joined text
  lead: number // leading chars dropped from this row (continuation indent)
  length: number
}

function rowContinuesOnto(terminal: Terminal, row: BufferLine, next: BufferLine): boolean {
  if (next.isWrapped) return true
  const text = row.translateToString(true)
  if (!text) return false
  if (columnForStringIndex(terminal, row, text.length) - 1 < terminal.cols - HARD_WRAP_EDGE_SLACK) return false
  return /\S/.test(next.translateToString(true))
}

// Joins the logical line containing `y` across soft and hard wraps.
function joinWrappedRows(terminal: Terminal, y: number): { text: string; segments: RowSegment[] } | null {
  const buffer = terminal.buffer.active
  if (!buffer.getLine(y)) return null

  let first = y
  while (first > 0 && y - first < MAX_JOINED_ROWS) {
    const prev = buffer.getLine(first - 1)
    if (!prev || !rowContinuesOnto(terminal, prev, buffer.getLine(first)!)) break
    first--
  }

  const segments: RowSegment[] = []
  let text = ''
  for (let row = first; segments.length < MAX_JOINED_ROWS * 2; row++) {
    const line = buffer.getLine(row)
    if (!line) break
    const raw = line.translateToString(true)
    // Soft wraps keep every cell; hard-wrapped continuations drop their indent.
    const lead = row === first || line.isWrapped ? 0 : raw.length - raw.trimStart().length
    const part = raw.slice(lead)
    segments.push({ y: row, line, offset: text.length, lead, length: part.length })
    text += part
    const next = buffer.getLine(row + 1)
    if (!next || !rowContinuesOnto(terminal, line, next)) break
  }
  return { text, segments }
}

// Maps an index in the joined text to a 1-based buffer position. `isEnd`
// keeps an exclusive end index on the row that holds its last character.
function positionForIndex(terminal: Terminal, segments: RowSegment[], index: number, isEnd: boolean): { x: number; y: number } {
  const seg = segments.find((s) => (isEnd ? index <= s.offset + s.length : index < s.offset + s.length)) ?? segments[segments.length - 1]
  const x = columnForStringIndex(terminal, seg.line, index - seg.offset + seg.lead)
  return { x, y: seg.y + 1 }
}

// A hand-rolled ILinkProvider, used for both URLs and file paths, that
// matches across wrapped rows. @xterm/addon-web-links only follows xterm's
// own soft wraps, so a URL Claude Code hard-wrapped opened truncated; it
// also can't serve file paths: its internal match filter unconditionally
// does `new URL(matchedText)` and discards anything that doesn't parse as
// one, which no file path ever does.
export function createWrappedLinkProvider(
  terminal: Terminal,
  regex: RegExp,
  activate: (event: MouseEvent, text: string) => void,
  accept: (text: string) => boolean = () => true
): ILinkProvider {
  return {
    provideLinks(bufferLineNumber, callback) {
      const joined = joinWrappedRows(terminal, bufferLineNumber - 1)
      if (!joined) {
        callback(undefined)
        return
      }

      const re = new RegExp(regex.source, 'g')
      const links: ILink[] = []
      let match: RegExpExecArray | null
      while ((match = re.exec(joined.text))) {
        const matchedText = match[0]
        if (!accept(matchedText)) continue
        const start = positionForIndex(terminal, joined.segments, match.index, false)
        const end = positionForIndex(terminal, joined.segments, match.index + matchedText.length, true)
        if (start.y > bufferLineNumber || end.y < bufferLineNumber) continue
        links.push({ text: matchedText, range: { start, end }, activate })
      }
      callback(links.length ? links : undefined)
    },
  }
}

function isParsableUrl(text: string): boolean {
  try {
    new URL(text)
    return true
  } catch {
    return false
  }
}

export function createUrlLinkProvider(terminal: Terminal, activate: (event: MouseEvent, uri: string) => void): ILinkProvider {
  return createWrappedLinkProvider(terminal, URL_REGEX, activate, isParsableUrl)
}

export function createFilePathLinkProvider(terminal: Terminal, activate: (event: MouseEvent, text: string) => void): ILinkProvider {
  return createWrappedLinkProvider(terminal, FILE_PATH_REGEX, activate)
}
