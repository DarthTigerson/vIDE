import type * as Monaco from 'monaco-editor'
import type { GitBlameLine } from '@/types/index'
import { getFileBlame } from '@/lib/gitBlame'
import { formatRelDate, formatExactDate } from '@/components/Git/commitFormat'

// End-of-line git-blame annotations ("Ada Lovelace, 3d ago - Add repo
// discovery") for the currently open file, in the style of GitLens/VS
// Code's built-in blame. attachBlameAnnotations is called once per Monaco
// mount, alongside the existing gutter decoration setup, and disposed
// alongside it (see Editor.tsx).
//
// Known v1 limitation: blame reflects the file as committed at HEAD (that's
// what electron/git.ts's getFileBlame blames), not the live buffer - a line
// added/removed by an uncommitted edit does not get its annotation
// live-remapped the way GitLens does. Annotations are placed by matching
// HEAD's line numbers directly onto the current model's line numbers, which
// is exactly right for an unmodified file and only drifts once the buffer's
// line count has actually changed from HEAD's.

const MAX_SUMMARY_LENGTH = 60

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export interface BlameDecorationSpec {
  line: number
  content: string
  hoverValue: string
}

// Pure - turns raw blame lines into the (line, label, tooltip) triples the
// Monaco-facing code below needs, independent of any Monaco instance so it's
// cheap to unit test. `lineCount` is the live model's current line count:
// lines beyond it (or before line 1) are dropped rather than attributed to
// the wrong place - see the "known v1 limitation" note above.
export function computeBlameDecorations(lines: GitBlameLine[], lineCount: number): BlameDecorationSpec[] {
  const specs: BlameDecorationSpec[] = []
  for (const l of lines) {
    if (l.line < 1 || l.line > lineCount) continue
    const iso = new Date(l.authorTime * 1000).toISOString()
    const when = formatRelDate(iso)
    const shortHash = l.hash.slice(0, 7)
    const summary = l.summary || '(no commit message)'
    specs.push({
      line: l.line,
      content: `  ${l.author}, ${when} • ${truncate(summary, MAX_SUMMARY_LENGTH)}`,
      hoverValue: `**${summary}**\n\n${l.author} — ${formatExactDate(iso)}\n\n\`${shortHash}\``,
    })
  }
  return specs
}

let stylesInjected = false

// Injects the annotation's CSS once per window. Kept here (rather than
// added to src/index.css) so this feature stays fully self-contained in its
// own new files.
function ensureStylesInjected(): void {
  if (stylesInjected) return
  stylesInjected = true
  const style = document.createElement('style')
  style.textContent = `
.git-blame-annotation {
  opacity: 0.5;
  font-style: italic;
}
`
  document.head.appendChild(style)
}

export interface BlameAnnotationsOptions {
  repoRoot: string
  relPath: string
}

export interface BlameAnnotationsHandle {
  // Re-fetches blame for the same (repoRoot, relPath) bypassing the cache -
  // call this from the same onGitChanged handler that already refreshes the
  // gutter decorations (see the integration snippet in the report).
  refresh: () => void
  // Tears down this mount's decorations. Call from the editor's existing
  // onDidDispose handler.
  dispose: () => void
}

// Fetches blame once (one `git blame` call for the whole file, cached by
// src/lib/gitBlame.ts) and renders it as an end-of-line decoration on every
// blamed line. Always-on when a repo can be resolved for the file - no
// settings toggle in v1 (see the report for why).
export function attachBlameAnnotations(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof import('monaco-editor'),
  { repoRoot, relPath }: BlameAnnotationsOptions
): BlameAnnotationsHandle {
  ensureStylesInjected()

  let cancelled = false
  const decorations = editor.createDecorationsCollection([])

  function apply(lines: GitBlameLine[]) {
    if (cancelled) return
    const model = editor.getModel()
    if (!model) return
    const specs = computeBlameDecorations(lines, model.getLineCount())
    decorations.set(
      specs.map((spec) => {
        const col = model.getLineMaxColumn(spec.line)
        return {
          range: new monaco.Range(spec.line, col, spec.line, col),
          options: {
            after: { content: spec.content, inlineClassName: 'git-blame-annotation' },
            hoverMessage: { value: spec.hoverValue },
          },
        }
      })
    )
  }

  function load(force: boolean) {
    getFileBlame(repoRoot, relPath, { force }).then((blame) => {
      if (!cancelled) apply(blame.lines)
    }).catch((error) => {
      // Never let a failed fetch (stale/missing window.api.gitBlame after a
      // renderer-only reload, a non-repo path, etc.) disappear silently -
      // the symptom otherwise is just "no blame ever shows up", with no clue
      // why. Annotations simply stay empty; nothing else to recover here.
      if (!cancelled) console.error('[blameAnnotations] failed to load blame', error)
    })
  }

  load(false)

  return {
    refresh: () => load(true),
    dispose: () => {
      cancelled = true
      decorations.clear()
    },
  }
}
