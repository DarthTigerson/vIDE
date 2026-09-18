import type * as Monaco from 'monaco-editor'
import type { GitBlameLine } from '@/types/index'
import { getFileBlame } from '@/lib/gitBlame'
import { formatRelDate, formatExactDate } from '@/components/Git/commitFormat'
import { buildLiveToHeadLineMap, type LineOrigin } from '@/lib/blameLineMap'

// Current-line git-blame annotation, shown only for the cursor's line and updated as it moves (GitLens-style).
// Blame is keyed by HEAD line numbers; buildLiveToHeadLineMap (blameLineMap.ts) remaps them since uncommitted edits shift lines apart.
//
// Rendered via a content widget (editor.addContentWidget), not a decoration's `after` text: InjectedText/`after`
// decorations never painted to the DOM in this app's embedded Monaco build (verified live - decorations.set()
// reports success with real content, but zero DOM elements with the target class ever exist, on a build where
// the installed and CDN-loaded monaco-editor versions match and the decoration shape matches Monaco's own
// types). Content widgets are the same mechanism inlineEditMonaco.ts already relies on, and do render correctly.

const MAX_SUMMARY_LENGTH = 60
const WIDGET_ID = 'vide.currentLineBlame'

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function buildBlameIndex(lines: GitBlameLine[]): Map<number, GitBlameLine> {
  const index = new Map<number, GitBlameLine>()
  for (const line of lines) index.set(line.line, line)
  return index
}

function formatBlameLine(line: GitBlameLine): { content: string; hoverValue: string } {
  const iso = new Date(line.authorTime * 1000).toISOString()
  const when = formatRelDate(iso)
  const shortHash = line.hash.slice(0, 7)
  const summary = line.summary || '(no commit message)'
  return {
    content: `${line.author}, ${when} • ${truncate(summary, MAX_SUMMARY_LENGTH)}`,
    hoverValue: `${summary}\n${line.author} — ${formatExactDate(iso)}\n${shortHash}`,
  }
}

export interface CurrentLineBlameOptions {
  repoRoot: string
  relPath: string
}

export interface CurrentLineBlameHandle {
  // Re-fetches blame and the HEAD blob, bypassing the cache.
  refresh: () => void
  // Tears down this mount's widget and any in-flight/pending work.
  dispose: () => void
}

// Always-on when a repo can be resolved for the file - no settings toggle.
export function attachCurrentLineBlame(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof import('monaco-editor'),
  { repoRoot, relPath }: CurrentLineBlameOptions
): CurrentLineBlameHandle {
  let cancelled = false
  let headContent: string | null = null
  let blameByHeadLine: Map<number, GitBlameLine> | null = null
  let lineOriginMap: Map<number, LineOrigin> | null = null

  const domNode = document.createElement('span')
  domNode.className = 'git-blame-annotation'
  let widgetLine = 1
  let widgetColumn = 1
  let widgetVisible = false

  const widget: Monaco.editor.IContentWidget = {
    getId: () => WIDGET_ID,
    getDomNode: () => domNode,
    getPosition: () =>
      widgetVisible
        ? {
            position: { lineNumber: widgetLine, column: widgetColumn },
            preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
          }
        : null,
  }
  editor.addContentWidget(widget)

  function show(line: number, column: number, text: string, hoverValue: string) {
    domNode.textContent = text
    domNode.title = hoverValue
    widgetLine = line
    widgetColumn = column
    widgetVisible = true
    editor.layoutContentWidget(widget)
  }

  function hide() {
    if (!widgetVisible) return
    widgetVisible = false
    editor.layoutContentWidget(widget)
  }

  function render(selection: Monaco.Selection | null) {
    if (cancelled || !selection) return
    const model = editor.getModel()
    if (!model) return
    // Triple-click/Cmd+L "select whole line" reports as spanning into the next line at column 1 - treat that as single-line too.
    const touchesNextLineOnly = selection.endColumn === 1 && selection.endLineNumber === selection.startLineNumber + 1
    const isSingleLine = selection.startLineNumber === selection.endLineNumber || touchesNextLineOnly
    if (!isSingleLine || !lineOriginMap || !blameByHeadLine) {
      hide()
      return
    }
    // A line-spanning selection has no real content on its second line, so use startLineNumber instead of the caret's positionLineNumber.
    const line = touchesNextLineOnly ? selection.startLineNumber : selection.positionLineNumber
    const origin = lineOriginMap.get(line)
    if (!origin) {
      hide()
      return
    }
    const col = model.getLineMaxColumn(line)
    if (origin.kind === 'uncommitted') {
      show(line, col, 'Uncommitted change', '')
      return
    }
    const blameLine = blameByHeadLine.get(origin.headLine)
    if (!blameLine) {
      hide()
      return
    }
    const { content, hoverValue } = formatBlameLine(blameLine)
    show(line, col, content, hoverValue)
  }

  async function loadAll(force: boolean) {
    try {
      const [blame, head] = await Promise.all([
        getFileBlame(repoRoot, relPath, { force }),
        window.api.gitFileAtHead(repoRoot, relPath),
      ])
      if (cancelled) return
      blameByHeadLine = buildBlameIndex(blame.lines)
      headContent = head
      const model = editor.getModel()
      lineOriginMap = model ? buildLiveToHeadLineMap(headContent, model.getValue()) : new Map()
      render(editor.getSelection())
    } catch (error) {
      // Log rather than fail silently - otherwise the symptom is just "no blame ever shows up", with no clue why.
      if (!cancelled) console.error('[currentLineBlame] failed to load blame', error)
    }
  }

  // Recomputed synchronously (it's a cheap in-memory diff, not the git shell-out that loadAll debounces/caches)
  // so a cursor-selection event immediately after an edit never renders against a pre-edit map - see blame-mismap
  // bug where a debounced recompute left stale blame showing on the wrong line for a moment after typing.
  editor.onDidChangeModelContent(() => {
    const model = editor.getModel()
    lineOriginMap = model && headContent !== null ? buildLiveToHeadLineMap(headContent, model.getValue()) : null
    render(editor.getSelection())
  })

  editor.onDidChangeCursorSelection((e) => render(e.selection))

  loadAll(false)

  return {
    refresh: () => loadAll(true),
    dispose: () => {
      cancelled = true
      editor.removeContentWidget(widget)
    },
  }
}
