import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MouseEvent, ReactNode } from 'react'
import type { FileNode } from '@/types/index'
import type { RecentProject } from '@/types/api'
import { useFileStore } from '@/stores/fileStore'
import { useEditorStore } from '@/stores/editorStore'
import { useSidebarUiStore } from '@/stores/sidebarUiStore'
import { isGitDiffTab, parseGitDiffPath, isGitCommitDiffTab, parseGitCommitDiffPath } from '@/components/Git/paths'
import { buildImagePreviewPath, buildMarkdownPreviewPath } from '@/components/Viewer/paths'
import { isImageFile, isMarkdownFile } from '@/lib/fileKinds'
import { FileTree, type TreePromptState } from './FileTree'
import { Modal } from '@/components/ui/Modal'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { buildTerminalPath } from '@/components/Settings/paths'
import { pendingTerminalCommands } from '@/components/Terminal/TerminalTab'
import { UndoToast } from '@/components/ui/UndoToast'

const UNDO_TIMEOUT_MS = 10000

type CreateKind = 'file' | 'directory'

interface ContextMenuState {
  x: number
  y: number
  node: FileNode | null
}

function dirname(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx <= 0 ? '/' : path.slice(0, idx)
}

function joinPath(dir: string, name: string): string {
  return `${dir.replace(/\/$/, '')}/${name}`
}

function shellQuote(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`
}

// Collects a path's ancestor directories (shallowest first, stopping at
// projectRoot) and expands each in turn — a directory's children aren't
// fetched until expandDir runs for it, so a deep target needs every level
// expanded in order before its own tree node exists to expand further.
async function expandAncestors(
  path: string,
  projectRoot: string,
  expandDir: (dir: string) => Promise<void>
): Promise<void> {
  const ancestors: string[] = []
  let dir = path
  while (true) {
    const lastSlash = dir.lastIndexOf('/')
    if (lastSlash < 0) break
    dir = dir.slice(0, lastSlash)
    if (dir.length <= projectRoot.length) break
    ancestors.unshift(dir)
  }
  for (const ancestor of ancestors) {
    await expandDir(ancestor)
  }
}

function copyText(text: string): void {
  navigator.clipboard?.writeText(text).catch(() => {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  })
}

export function Sidebar() {
  const { projectRoot, tree, openFolder, refreshTree, expandDir, collapseAll } = useFileStore()
  const { openTab, activeTabPath } = useEditorStore()
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [prompt, setPrompt] = useState<TreePromptState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FileNode | null>(null)
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const [undoMove, setUndoMove] = useState<{ from: string; to: string } | null>(null)
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const clear = () => setDragOverPath(null)
    window.addEventListener('dragend', clear)
    window.addEventListener('drop', clear)
    return () => {
      window.removeEventListener('dragend', clear)
      window.removeEventListener('drop', clear)
    }
  }, [])

  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
  }, [])

  useEffect(() => {
    if (!projectRoot || !activeTabPath) return

    // isGitDiffTab/isGitCommitDiffTab both carry a repo-*relative* path
    // (what git status/git show hand back) — needs the diff tab's own
    // repoRoot re-joined before it's a real absolute path this tree deals in.
    const realPath = isGitDiffTab(activeTabPath)
      ? `${parseGitDiffPath(activeTabPath).repoRoot}/${parseGitDiffPath(activeTabPath).path}`
      : isGitCommitDiffTab(activeTabPath)
        ? `${parseGitCommitDiffPath(activeTabPath).repoRoot}/${parseGitCommitDiffPath(activeTabPath).path}`
        : activeTabPath.includes('://')
          ? null
          : activeTabPath

    if (!realPath || !realPath.startsWith(projectRoot + '/')) return

    let cancelled = false
    ;(async () => {
      await expandAncestors(realPath, projectRoot, (dir) => {
        if (cancelled) return Promise.resolve()
        return expandDir(dir)
      })
    })()

    return () => { cancelled = true }
  }, [activeTabPath, projectRoot])

  const pendingCreate = useSidebarUiStore((s) => s.pendingCreate)

  useEffect(() => {
    if (!pendingCreate || !projectRoot) return
    useSidebarUiStore.getState().clearPendingCreate()
    startCreate(pendingCreate, null)
  }, [pendingCreate, projectRoot])

  const revealRequest = useSidebarUiStore((s) => s.revealRequest)

  useEffect(() => {
    if (!revealRequest || !projectRoot) return
    if (!revealRequest.path.startsWith(projectRoot + '/')) return

    let cancelled = false
    ;(async () => {
      await expandAncestors(revealRequest.path, projectRoot, (dir) => {
        if (cancelled) return Promise.resolve()
        return expandDir(dir)
      })
      if (cancelled) return
      if (revealRequest.expandTarget) await expandDir(revealRequest.path)
      if (cancelled) return
      useFileStore.getState().setRevealedPath(revealRequest.path)
      useSidebarUiStore.getState().clearRevealRequest()
      // Wait a frame so the newly-expanded nodes have actually committed to
      // the DOM before we try to scroll to one of them.
      requestAnimationFrame(() => {
        document
          .getElementById(`file-tree-node:${revealRequest.path}`)
          ?.scrollIntoView({ block: 'center' })
      })
    })()

    return () => { cancelled = true }
  }, [revealRequest, projectRoot])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menu])

  // The menu's real height depends on which items it shows (file vs
  // directory, has-parent vs root), so a hardcoded size estimate at the
  // click site can under-guess it and let the menu overhang the window.
  // Measure the actual rendered element and clamp for real, before paint.
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const clamped = clampToViewport(menu.x, menu.y, rect.width, rect.height)
    menuRef.current.style.left = `${clamped.x}px`
    menuRef.current.style.top = `${clamped.y}px`
  }, [menu])

  function targetDirectory(node: FileNode | null): string | null {
    if (!projectRoot) return null
    if (!node) return projectRoot
    return node.isDirectory ? node.path : dirname(node.path)
  }

  function openContextMenu(event: MouseEvent, node: FileNode | null) {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, node })
  }

  async function startCreate(kind: CreateKind, node: FileNode | null) {
    const directory = targetDirectory(node)
    if (!directory) return
    if (node?.isDirectory) await expandDir(node.path)
    setMenu(null)
    setPrompt({
      kind,
      value: '',
      directory,
      node: null,
    })
  }

  function startRename(node: FileNode) {
    setMenu(null)
    setPrompt({
      kind: 'rename',
      value: node.name,
      directory: dirname(node.path),
      node,
    })
  }

  async function openFile(node: FileNode) {
    if (node.isDirectory) return
    setMenu(null)
    const content = await window.api.readFile(node.path)
    openTab({ path: node.path, content, dirty: false })
  }

  function openImagePreview(node: FileNode) {
    setMenu(null)
    openTab({ path: buildImagePreviewPath(node.path), content: '', dirty: false })
  }

  function openMarkdownPreview(node: FileNode) {
    setMenu(null)
    openTab({ path: buildMarkdownPreviewPath(node.path), content: '', dirty: false })
  }

  async function commitPrompt() {
    if (!prompt) return
    const name = prompt.value.trim()
    if (!name) {
      setPrompt(null)
      return
    }

    const path = joinPath(prompt.directory, name)
    if (prompt.kind === 'file') {
      await window.api.writeFile(path, '')
      await refreshTree()
      const content = await window.api.readFile(path)
      openTab({ path, content, dirty: false })
    } else if (prompt.kind === 'directory') {
      await window.api.mkdir(path)
      await refreshTree()
    } else if (prompt.node && path !== prompt.node.path) {
      await window.api.renamePath(prompt.node.path, path)
      await refreshTree()
    }

    setPrompt(null)
  }

  function setPromptValue(value: string) {
    setPrompt((current) => current ? { ...current, value } : current)
  }

  function cancelPrompt() {
    setPrompt(null)
  }

  function requestTrashNode(node: FileNode) {
    setMenu(null)
    setDeleteTarget(node)
  }

  function runScript(node: FileNode) {
    setMenu(null)
    const id = Date.now().toString(36)
    pendingTerminalCommands.set(id, `bash ${shellQuote(node.path)}\n`)
    openTab({ path: buildTerminalPath(id), content: '', dirty: false })
  }

  async function trashNode(node: FileNode) {
    await window.api.trashPath(node.path)
    useEditorStore.getState().markTabsMissingForDeletedPath(node.path)
    await refreshTree()
    setDeleteTarget(null)
  }

  async function moveNode(sourcePath: string, targetDir: string) {
    if (!projectRoot) return
    if (sourcePath === targetDir || targetDir.startsWith(sourcePath + '/')) return
    if (dirname(sourcePath) === targetDir) return
    const destPath = joinPath(targetDir, sourcePath.split('/').pop()!)
    if (await window.api.pathExists(destPath)) return
    await window.api.renamePath(sourcePath, destPath)
    await refreshTree()
    armUndo(sourcePath, destPath)
  }

  function armUndo(from: string, to: string) {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoMove({ from, to })
    undoTimerRef.current = setTimeout(() => setUndoMove(null), UNDO_TIMEOUT_MS)
  }

  async function undoMoveNode() {
    if (!undoMove) return
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    const { from, to } = undoMove
    setUndoMove(null)
    await window.api.renamePath(to, from)
    await refreshTree()
  }

  return (
    <div
      className="relative h-full flex flex-col bg-sidebar border-r border-border overflow-hidden"
      onContextMenu={(event) => openContextMenu(event, null)}
    >
      {undoMove && (
        <UndoToast
          message={`Moved "${undoMove.from.split('/').pop()}"`}
          onUndo={undoMoveNode}
        />
      )}
      {projectRoot ? (
        <>
          <div className="h-9 px-3 flex items-center justify-between border-b border-border shrink-0">
            <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider truncate">
              {projectRoot.split('/').pop()}
            </span>
          </div>

          <div
            className={`flex-1 overflow-y-auto py-1 ${dragOverPath === projectRoot ? 'bg-accent/5' : ''}`}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              if (dragOverPath !== projectRoot) setDragOverPath(projectRoot)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragOverPath(null)
              const sourcePath = event.dataTransfer.getData('text/plain')
              if (sourcePath) moveNode(sourcePath, projectRoot)
            }}
          >
            <FileTree
              nodes={tree}
              directoryPath={projectRoot}
              onContextMenu={openContextMenu}
              prompt={prompt}
              setPromptValue={setPromptValue}
              commitPrompt={commitPrompt}
              cancelPrompt={cancelPrompt}
              dragOverPath={dragOverPath}
              setDragOverPath={setDragOverPath}
              onMoveNode={moveNode}
            />
          </div>

          {menu && createPortal(
            <div
              ref={menuRef}
              className="fixed z-[200] w-44 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50"
              style={{ left: menu.x, top: menu.y }}
              onClick={(event) => event.stopPropagation()}
            >
              {menu.node && !menu.node.isDirectory && (
                <ContextMenuButton onClick={() => openFile(menu.node!)}>
                  Open / Edit
                </ContextMenuButton>
              )}
              {menu.node && !menu.node.isDirectory && isImageFile(menu.node.name) && (
                <ContextMenuButton onClick={() => openImagePreview(menu.node!)}>
                  View in Image Viewer
                </ContextMenuButton>
              )}
              {menu.node && !menu.node.isDirectory && isMarkdownFile(menu.node.name) && (
                <ContextMenuButton onClick={() => openMarkdownPreview(menu.node!)}>
                  View in Markdown Viewer
                </ContextMenuButton>
              )}
              {menu.node && !menu.node.isDirectory && menu.node.name.endsWith('.sh') && (
                <ContextMenuButton onClick={() => runScript(menu.node!)}>
                  Run
                </ContextMenuButton>
              )}
              <ContextMenuButton onClick={() => startCreate('file', menu.node)}>
                Create File
              </ContextMenuButton>
              <ContextMenuButton onClick={() => startCreate('directory', menu.node)}>
                Create Directory
              </ContextMenuButton>
              <ContextMenuDivider />
              <ContextMenuButton onClick={() => {
                collapseAll()
                setMenu(null)
              }}>
                Collapse All
              </ContextMenuButton>
              {menu.node && (
                <>
                  <ContextMenuDivider />
                  <ContextMenuButton onClick={() => startRename(menu.node!)}>
                    Rename
                  </ContextMenuButton>
                  <ContextMenuButton onClick={() => {
                    copyText(menu.node!.path)
                    setMenu(null)
                  }}>
                    Copy Path
                  </ContextMenuButton>
                  <ContextMenuDivider />
                  <ContextMenuButton danger onClick={() => requestTrashNode(menu.node!)}>
                    Move to Trash
                  </ContextMenuButton>
                </>
              )}
            </div>,
            document.body
          )}

          {deleteTarget && (
            <Modal onClose={() => setDeleteTarget(null)}>
              <h2 className="text-sm font-semibold text-fg mb-1">Move to Trash</h2>
              <p className="text-sm text-fg-muted mb-5">
                Move{' '}
                <span className="font-mono text-fg break-all">
                  {deleteTarget.name}
                </span>{' '}
                to the Trash?
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-1.5 text-sm rounded-lg border border-border text-fg-muted hover:text-fg hover:border-fg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => trashNode(deleteTarget)}
                  className="px-4 py-1.5 text-sm rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold transition-colors"
                >
                  Move to Trash
                </button>
              </div>
            </Modal>
          )}
        </>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 px-4 pb-4">
          <div className="flex-1 min-h-0 flex flex-col items-center justify-end gap-3 pb-6">
            <p className="text-xs text-fg-muted text-center">Select a project</p>
            <button
              onClick={openFolder}
              className="w-40 px-3 py-1.5 text-sm bg-accent hover:bg-accent/80 text-panel rounded transition-colors"
            >
              Open Folder
            </button>
          </div>
          <RecentProjectsList />
        </div>
      )}
    </div>
  )
}

function recentProjectName(path: string): string {
  return path.split('/').pop() ?? path
}

// Inline replacement for what used to be a "Recent Projects" button that
// opened the searchable RecentProjectsPalette (still available anywhere via
// Ctrl+R) — when there's nothing open yet, showing the list itself right in
// the empty state saves the extra click.
function RecentProjectsList() {
  const [recents, setRecents] = useState<RecentProject[]>([])

  useEffect(() => {
    window.api.recentProjectsList().then(setRecents)
  }, [])

  async function open(path: string) {
    if (await window.api.focusProjectIfOpen(path)) return
    useFileStore.getState().openRecentProject(path)
  }

  // Always render this flex-1 sibling, even with nothing to list yet (the
  // fetch hasn't resolved) or ever (no recents at all) — otherwise the
  // "Select a project" block above becomes the *only* flex-1 child and its
  // justify-end sinks it to the very bottom instead of roughly centered.
  return (
    <div className="w-full flex-1 min-h-0 flex flex-col gap-1">
      {recents.length > 0 && (
        <ul className="flex-1 min-h-0 flex flex-col gap-0.5 overflow-y-auto">
          {recents.map((recent) => (
            <li key={recent.path}>
              <button
                type="button"
                onClick={() => open(recent.path)}
                className="w-full text-left px-2.5 py-1.5 rounded hover:bg-white/5 transition-colors"
              >
                <div className="text-sm text-fg truncate">{recentProjectName(recent.path)}</div>
                <div className="text-xs text-fg-subtle truncate">{recent.path}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ContextMenuButton({ children, danger = false, onClick }: {
  children: ReactNode
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full rounded px-2 py-1.5 text-left text-xs transition-colors',
        danger
          ? 'text-red-300 hover:bg-red-500/15 hover:text-red-200'
          : 'text-fg-muted hover:bg-white/5 hover:text-fg',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function ContextMenuDivider() {
  return <div className="my-1 h-px bg-border" />
}
