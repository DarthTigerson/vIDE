import type { Terminal, ILink, ILinkProvider } from '@xterm/xterm'
import { useEditorStore } from '@/stores/editorStore'
import { useBrowserStore } from '@/stores/browserStore'
import { useFileStore } from '@/stores/fileStore'
import { useGitReposStore } from '@/stores/gitReposStore'
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
    const absPath = resolveFileLinkPath(rawPath, projectRoot, homeDir)
    if (!(await window.api.pathExists(absPath))) {
      if (looksLikeBareDomain(rawPath)) openUrlInBrowserTab(`https://${rawPath}`)
      return
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
// FILE_PATH_LINK_PROVIDER below for why we can't just reuse that addon).
function columnForStringIndex(terminal: Terminal, line: NonNullable<ReturnType<Terminal['buffer']['active']['getLine']>>, strIndex: number): number {
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

// A hand-rolled ILinkProvider for file paths — @xterm/addon-web-links can't
// be reused here despite its `urlRegex` option looking pluggable: its
// internal match filter unconditionally does `new URL(matchedText)` and
// discards anything that doesn't parse as one, which no file path ever does.
// (Confirmed by reading its bundled source — this is why file paths never
// even got a hover-underline, regardless of how the regex was tuned.) Only
// looks within a single buffer line — a path that happens to visually wrap
// across two terminal rows won't be detected, an accepted trade-off for
// staying simple and correct rather than reimplementing the addon's
// wrapped-line joining too.
export function createFilePathLinkProvider(terminal: Terminal, activate: (event: MouseEvent, text: string) => void): ILinkProvider {
  return {
    provideLinks(bufferLineNumber, callback) {
      const line = terminal.buffer.active.getLine(bufferLineNumber - 1)
      if (!line) {
        callback(undefined)
        return
      }

      const text = line.translateToString(true)
      const re = new RegExp(FILE_PATH_REGEX.source, 'g')
      const links: ILink[] = []
      let match: RegExpExecArray | null
      while ((match = re.exec(text))) {
        const matchedText = match[0]
        const startCol = columnForStringIndex(terminal, line, match.index)
        const endCol = columnForStringIndex(terminal, line, match.index + matchedText.length)
        links.push({
          text: matchedText,
          range: { start: { x: startCol, y: bufferLineNumber }, end: { x: endCol, y: bufferLineNumber } },
          activate,
        })
      }
      callback(links.length ? links : undefined)
    },
  }
}
