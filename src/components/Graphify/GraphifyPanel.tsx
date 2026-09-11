import { useEffect, useRef } from 'react'
import { useGraphifyStore } from '@/stores/graphifyStore'
import { useFileStore } from '@/stores/fileStore'
import { useGitReposStore, useActiveRepo } from '@/stores/gitReposStore'
import { useEditorStore } from '@/stores/editorStore'
import { GRAPHIFY_GRAPH_TAB_PATH } from '@/components/Settings/paths'
import { buildMarkdownPreviewPath } from '@/components/Viewer/paths'

// Matches GitPanel's pill button styling so Graphify's controls read as part
// of the same left-sidebar panel family.
const pillButtonClass =
  'w-full h-7 rounded-full flex items-center justify-center text-[0.625rem] font-bold tracking-tight bg-accent/80 text-on-accent transition-colors hover:bg-accent active:scale-95 disabled:opacity-40 disabled:pointer-events-none'

export function GraphifyPanel() {
  const projectRoot = useFileStore((s) => s.projectRoot)
  // A project root can be an umbrella folder holding many independent git
  // repos (a devops monorepo-of-repos layout) — running graphify against it
  // recursively indexes every repo underneath, not just the one the user is
  // working in, which is what made it slow enough to be reported as a real
  // performance problem on some machines. useActiveRepo() is the same "which
  // repo is actually being worked on" signal the Git panel and the
  // activity-bar badge use (VIDE-87) — it's null in a multi-repo project
  // until something is actually open, even though selectedRepo may already
  // hold an internally auto-picked value. projectRoot is the fallback only
  // for a project with no discovered git repo at all.
  const repos = useGitReposStore((s) => s.repos)
  const resolvedActiveRepo = useActiveRepo()
  // Only fall back to projectRoot when there's no discovered git repo at
  // all — a multi-repo project with nothing open must stay null, not
  // silently fall back to the umbrella root (that's the exact bug this
  // scoping exists to prevent).
  const activeRepo = repos.length === 0 ? projectRoot : resolvedActiveRepo
  const activeRepoName = activeRepo?.split('/').pop() ?? null
  const {
    available, checking, running, progress, error, graph, checkAvailable, run, loadGraph,
  } = useGraphifyStore()
  const openTab = useEditorStore((s) => s.openTab)

  useEffect(() => {
    if (available === null && !checking) checkAvailable()
  }, [available, checking, checkAvailable])

  // Auto-open the Graph tab the moment a build finishes successfully, so a
  // fresh build doesn't require a second click on "Open Graph" — only fires
  // on the true→false edge of `running`, not on every render.
  const wasRunningRef = useRef(false)
  useEffect(() => {
    if (wasRunningRef.current && !running && !error && graph) {
      openTab({ path: GRAPHIFY_GRAPH_TAB_PATH, content: '', dirty: false })
    }
    wasRunningRef.current = running
  }, [running, error, graph, openTab])

  if (available === false) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center bg-sidebar border-r border-border">
        <div>
          <p className="text-sm text-fg mb-2">graphify isn't installed.</p>
          <p className="text-xs text-fg-subtle font-mono">uv tool install graphifyy && graphify install</p>
        </div>
      </div>
    )
  }

  function openGraph() {
    openTab({ path: GRAPHIFY_GRAPH_TAB_PATH, content: '', dirty: false })
    // Always re-read graphify-out/graph.json for the active repo from disk
    // at click time, rather than relying on stale in-memory state — this is
    // what lets the panel pick up a graph that already existed on disk
    // (built in a prior session, or via the CLI directly) and keeps
    // switching repos from showing a previous repo's graph.
    if (activeRepo) loadGraph(activeRepo)
  }

  function openReport() {
    if (!activeRepo) return
    openTab({
      path: buildMarkdownPreviewPath(`${activeRepo}/graphify-out/GRAPH_REPORT.md`),
      content: '',
      dirty: false,
    })
  }

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
      <div className="h-9 px-3 border-b border-border shrink-0 flex items-center justify-between">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
          Graphify
        </span>
        {activeRepoName && (
          <span className="text-[0.6875rem] text-fg-muted truncate">{activeRepoName}</span>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {!activeRepo && repos.length > 1 && (
          <div className="flex-1 flex items-center justify-center px-6 text-center text-xs text-fg-subtle">
            No repo open. Open one from the Git panel first.
          </div>
        )}

        {(running || (error && !running)) && (
          <div className="shrink-0 px-3 py-2 flex flex-col gap-2">
            {running && (
              <div className="text-xs text-fg-muted font-mono whitespace-pre-wrap border border-border rounded p-2 max-h-64 overflow-y-auto">
                {progress || `Running graphify on ${activeRepoName ?? 'this project'}…`}
              </div>
            )}
            {error && !running && (
              <div className="text-xs text-red-400 whitespace-pre-wrap border border-red-400/30 rounded p-2 max-h-64 overflow-y-auto">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 px-3 py-2 flex flex-col gap-1.5 border-t border-border">
        <button
          type="button"
          className={pillButtonClass}
          disabled={!activeRepo || running}
          onClick={() => activeRepo && run(activeRepo)}
        >
          {graph ? 'Rebuild graph' : 'Build graph'}
        </button>
        <button
          type="button"
          className={pillButtonClass}
          disabled={!activeRepo}
          onClick={openGraph}
        >
          Open Graph
        </button>
        <button
          type="button"
          className={pillButtonClass}
          disabled={!activeRepo}
          onClick={openReport}
        >
          Open Report
        </button>
      </div>
    </div>
  )
}
