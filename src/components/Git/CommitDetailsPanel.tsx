import { useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { useEditorStore } from '@/stores/editorStore'
import { useGitStore } from '@/stores/gitStore'
import { useSidebarUiStore } from '@/stores/sidebarUiStore'
import type { GitCommit } from '@/types/index'
import {
  normalizeRef,
  formatExactDate,
  formatRelDate,
  refTone,
  copyToClipboard,
  parseRefTarget,
  type RefTarget,
} from './commitFormat'
import { CommitFileContextMenu } from './CommitFileContextMenu'
import { RefContextMenu } from './RefContextMenu'
import { buildGitCommitDiffPath } from './paths'
import { clampSize, loadPanelSize } from '@/lib/panelSize'

const DETAIL_WIDTH_KEY = 'vide:git:commitDetailsWidth'
const MIN_DETAIL_WIDTH = 320 // matches the panel's previous fixed w-80
const MAX_DETAIL_WIDTH = 720

function clampDetailWidth(width: number): number {
  // Extra safety clamp on top of MAX_DETAIL_WIDTH so a narrow window can't
  // get the commit list squeezed down to nothing.
  const viewportMax = typeof window !== 'undefined' ? window.innerWidth - 200 : MAX_DETAIL_WIDTH
  return clampSize(width, MIN_DETAIL_WIDTH, Math.min(MAX_DETAIL_WIDTH, viewportMax))
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy(e: MouseEvent) {
    e.stopPropagation()
    copyToClipboard(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      className="shrink-0 text-fg-subtle hover:text-fg transition-colors"
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  )
}

interface FileMenuState {
  x: number
  y: number
  path: string
}

interface RefMenuState extends RefTarget {
  x: number
  y: number
}

// Shared by GitGraphPage and GitBranchDiffPage — takes the resolved commit
// directly rather than looking it up from a specific store, so it doesn't
// care which view (or which commit list) it's being shown from.
export function CommitDetailsPanel({ cwd, commit, onClose }: {
  cwd: string
  commit: GitCommit
  onClose: () => void
}) {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [fileMenu, setFileMenu] = useState<FileMenuState | null>(null)
  const [refMenu, setRefMenu] = useState<RefMenuState | null>(null)
  const [width, setWidth] = useState(() =>
    loadPanelSize(DETAIL_WIDTH_KEY, MIN_DETAIL_WIDTH, MIN_DETAIL_WIDTH, MAX_DETAIL_WIDTH)
  )
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setFilesLoading(true)
    window.api.gitShowStat(cwd, commit.hash).then((files) => {
      if (!cancelled) {
        setSelectedFiles(files)
        setFilesLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [cwd, commit.hash])

  function openFileDiff(path: string) {
    useEditorStore.getState().openTab({ path: buildGitCommitDiffPath(cwd, commit.hash, path), content: '', dirty: false })
  }

  async function openCurrentFile(path: string) {
    const fullPath = `${cwd}/${path}`
    const content = await window.api.readFile(fullPath)
    useEditorStore.getState().openTab({ path: fullPath, content, dirty: false })
  }

  function revealInFileTree(path: string) {
    useSidebarUiStore.getState().requestReveal(`${cwd}/${path}`)
  }

  function handleFileContextMenu(e: MouseEvent, path: string) {
    e.preventDefault()
    e.stopPropagation()
    setFileMenu({ x: e.clientX, y: e.clientY, path })
  }

  function handleRefContextMenu(e: MouseEvent, ref: string) {
    const target = parseRefTarget(ref)
    if (!target) return
    e.preventDefault()
    e.stopPropagation()
    setRefMenu({ x: e.clientX, y: e.clientY, ...target })
  }

  function checkoutRef(target: RefTarget) {
    useGitStore.getState().checkout(
      cwd,
      target.kind === 'remote'
        ? { ref: target.name, create: true, track: `origin/${target.name}` }
        : { ref: target.name, create: false }
    )
  }

  // The panel sits on the right edge of the layout, so dragging the handle
  // left (mouse moving toward smaller clientX) grows it. Width is applied
  // directly to the DOM node during the drag for smooth 60fps feedback
  // without re-rendering on every mousemove; React state (and localStorage)
  // only gets the final value on mouseup.
  function handleResizeStart(e: MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = panelRef.current?.getBoundingClientRect().width ?? width

    function onMove(moveEvent: globalThis.MouseEvent) {
      const next = clampDetailWidth(startWidth + (startX - moveEvent.clientX))
      if (panelRef.current) panelRef.current.style.width = `${next}px`
    }

    function onUp(upEvent: globalThis.MouseEvent) {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      const next = clampDetailWidth(startWidth + (startX - upEvent.clientX))
      setWidth(next)
      localStorage.setItem(DETAIL_WIDTH_KEY, String(next))
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <>
      <div
        ref={panelRef}
        style={{ width }}
        className="relative shrink-0 border-l border-border flex flex-col bg-sidebar overflow-hidden"
      >
        <div
          onMouseDown={handleResizeStart}
          className="absolute -left-0.5 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/60 transition-colors z-10"
        />
        <div className="h-11 flex items-center justify-between px-4 border-b border-border shrink-0">
          <span className="text-[0.625rem] font-semibold text-fg-muted uppercase tracking-wider">
            Commit Details
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-subtle hover:text-fg transition-colors text-xs leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-white/10"
            aria-label="Close commit details"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
          <div className="border border-border bg-panel rounded-md p-3">
            <div className="text-[0.625rem] text-fg-muted uppercase tracking-wider mb-2">
              Selected node
            </div>
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm text-fg font-medium leading-snug">{commit.subject}</div>
              <CopyButton value={commit.subject} label="message" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[0.625rem]">
              <div className="border border-border rounded px-2 py-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-fg-subtle uppercase tracking-wider">Hash</span>
                  <CopyButton value={commit.hash} label="hash" />
                </div>
                <div className="font-mono text-fg mt-1 truncate">{commit.hash.slice(0, 12)}</div>
              </div>
              <div className="border border-border rounded px-2 py-1.5">
                <div className="text-fg-subtle uppercase tracking-wider">Parents</div>
                <div className="font-mono text-fg mt-1">{commit.parents.length || 'root'}</div>
              </div>
            </div>
          </div>

          <div className="text-xs text-fg-muted flex flex-col gap-2">
            <div className="flex justify-between gap-3 items-center">
              <span className="text-fg-subtle">Author</span>
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="text-fg truncate text-right">{commit.author}</span>
                <CopyButton value={commit.author} label="author" />
              </span>
            </div>
            <div className="flex justify-between gap-3 items-center">
              <span className="text-fg-subtle">Date</span>
              <span className="flex items-center gap-1.5">
                <span className="text-fg text-right">{formatExactDate(commit.date)}</span>
                <CopyButton value={formatExactDate(commit.date)} label="date" />
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-fg-subtle">Relative</span>
              <span className="text-fg text-right">{formatRelDate(commit.date)}</span>
            </div>
          </div>

          {commit.refs.length > 0 && (
            <div>
              <div className="text-[0.625rem] font-semibold text-fg-muted uppercase tracking-wider mb-2">
                References
              </div>
              <div className="flex flex-wrap gap-1">
                {commit.refs.map((ref) => (
                  <span
                    key={ref}
                    onContextMenu={(e) => handleRefContextMenu(e, ref)}
                    className={`max-w-full truncate text-[0.5625rem] font-semibold px-1.5 py-0.5 rounded border leading-none ${refTone(ref)}`}
                  >
                    {normalizeRef(ref)}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-[0.625rem] font-semibold text-fg-muted uppercase tracking-wider mb-2">
              Changed Files
            </div>
            {filesLoading ? (
              <div className="text-xs text-fg-subtle">Loading…</div>
            ) : selectedFiles.length === 0 ? (
              <div className="text-xs text-fg-subtle">No files</div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {selectedFiles.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => openFileDiff(f)}
                    onContextMenu={(e) => handleFileContextMenu(e, f)}
                    className="w-full flex items-center gap-2 py-0.5 text-left rounded hover:bg-white/5 transition-colors"
                  >
                    <span className="text-[0.6875rem] font-mono text-fg truncate opacity-80">{f}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {fileMenu && (
        <CommitFileContextMenu
          x={fileMenu.x}
          y={fileMenu.y}
          onCopyPath={() => copyToClipboard(fileMenu.path)}
          onOpenFile={() => openCurrentFile(fileMenu.path)}
          onOpenDiff={() => openFileDiff(fileMenu.path)}
          onRevealInFileTree={() => revealInFileTree(fileMenu.path)}
          onClose={() => setFileMenu(null)}
        />
      )}
      {refMenu && (
        <RefContextMenu
          x={refMenu.x}
          y={refMenu.y}
          name={refMenu.name}
          kind={refMenu.kind}
          onCheckout={() => checkoutRef(refMenu)}
          onClose={() => setRefMenu(null)}
        />
      )}
    </>
  )
}
