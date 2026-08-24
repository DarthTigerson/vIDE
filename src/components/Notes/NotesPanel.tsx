import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MouseEvent, ReactNode } from 'react'
import type { FileNode } from '@/types/index'
import { useNotesStore } from '@/stores/notesStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildMarkdownPreviewPath } from '@/components/Viewer/paths'
import { Modal } from '@/components/ui/Modal'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { NotesTree, type NotesPromptState } from './NotesTree'

type CreateKind = 'note' | 'folder'

interface ContextMenuState {
  x: number
  y: number
  node: FileNode | null
}

function dirname(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx <= 0 ? '/' : path.slice(0, idx)
}

function noteDisplayName(name: string): string {
  return name.endsWith('.md') ? name.slice(0, -3) : name
}

// -1 for the root itself, so a new item created directly in it lands at
// depth 0 (a Book) via depthOf(directory) + 1.
function depthOf(path: string, root: string): number {
  if (path === root) return -1
  return path.slice(root.length + 1).split('/').length - 1
}

function folderLabel(depth: number): string {
  return depth === 0 ? 'Book' : depth === 1 ? 'Chapter' : 'Folder'
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

export function NotesPanel() {
  const root = useNotesStore((s) => s.root)
  const loadRoot = useNotesStore((s) => s.loadRoot)
  const { openTab, activeTabPath } = useEditorStore()

  const [childrenByDir, setChildrenByDir] = useState<Record<string, FileNode[]>>({})
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [prompt, setPrompt] = useState<NotesPromptState | null>(null)
  const [promptError, setPromptError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FileNode | null>(null)

  async function refreshDir(dirPath: string) {
    const nodes = await window.api.readDir(dirPath)
    setChildrenByDir((current) => ({ ...current, [dirPath]: nodes }))
  }

  useEffect(() => {
    loadRoot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (root) refreshDir(root)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root])

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

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const clamped = clampToViewport(menu.x, menu.y, rect.width, rect.height)
    menuRef.current.style.left = `${clamped.x}px`
    menuRef.current.style.top = `${clamped.y}px`
  }, [menu])

  function openContextMenu(event: MouseEvent, node: FileNode | null) {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ x: event.clientX, y: event.clientY, node })
  }

  async function toggleDir(node: FileNode) {
    if (expandedPaths.has(node.path)) {
      setExpandedPaths((current) => {
        const next = new Set(current)
        next.delete(node.path)
        return next
      })
    } else {
      if (!childrenByDir[node.path]) await refreshDir(node.path)
      setExpandedPaths((current) => new Set(current).add(node.path))
    }
  }

  async function openNote(node: FileNode) {
    setMenu(null)
    const content = await window.api.readFile(node.path)
    openTab({ path: node.path, content, dirty: false })
  }

  function targetDirectory(node: FileNode | null): string | null {
    if (!root) return null
    if (!node) return root
    return node.isDirectory ? node.path : dirname(node.path)
  }

  async function startCreate(kind: CreateKind, node: FileNode | null) {
    const directory = targetDirectory(node)
    if (!directory || !root) return
    if (node?.isDirectory && !expandedPaths.has(node.path)) await toggleDir(node)
    setMenu(null)
    setPromptError(null)
    const label = kind === 'note' ? 'Note' : folderLabel(depthOf(directory, root) + 1)
    setPrompt({ kind, value: '', directory, node: null, label })
  }

  function startRename(node: FileNode) {
    if (!root) return
    setMenu(null)
    setPromptError(null)
    setPrompt({
      kind: 'rename',
      value: node.isDirectory ? node.name : noteDisplayName(node.name),
      directory: dirname(node.path),
      node,
      label: node.isDirectory ? folderLabel(depthOf(node.path, root)) : 'Note',
    })
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

    try {
      if (prompt.kind === 'note') {
        const result = await window.api.notesCreateNote(prompt.directory, name)
        await refreshDir(prompt.directory)
        openTab({ path: result.path, content: '', dirty: false })
      } else if (prompt.kind === 'folder') {
        await window.api.notesCreateFolder(prompt.directory, name)
        await refreshDir(prompt.directory)
      } else if (prompt.node) {
        const isNote = !prompt.node.isDirectory
        await window.api.notesRenameEntry(prompt.node.path, name, isNote)
        await refreshDir(dirname(prompt.node.path))
      }
      setPrompt(null)
      setPromptError(null)
    } catch (e) {
      setPromptError(e instanceof Error ? e.message : 'That name is not available')
    }
  }

  function setPromptValue(value: string) {
    setPrompt((current) => (current ? { ...current, value } : current))
    setPromptError(null)
  }

  function cancelPrompt() {
    setPrompt(null)
    setPromptError(null)
  }

  function requestTrashNode(node: FileNode) {
    setMenu(null)
    setDeleteTarget(node)
  }

  async function trashNode(node: FileNode) {
    await window.api.trashPath(node.path)
    useEditorStore.getState().markTabsMissingForDeletedPath(node.path)
    await refreshDir(dirname(node.path))
    setDeleteTarget(null)
  }

  return (
    <div
      className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden"
      onContextMenu={(e) => openContextMenu(e, null)}
    >
      <div className="h-9 px-3 border-b border-border shrink-0 flex items-center justify-between">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Notes</span>
        <button
          type="button"
          aria-label="New Note"
          onClick={() => startCreate('note', null)}
          className="w-5 h-5 rounded flex items-center justify-center text-fg-muted hover:text-fg hover:bg-white/10"
        >
          +
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {root && (
          <NotesTree
            nodes={childrenByDir[root] ?? []}
            directoryPath={root}
            expandedPaths={expandedPaths}
            childrenByDir={childrenByDir}
            activeNotePath={activeTabPath}
            onToggle={toggleDir}
            onOpenNote={openNote}
            onContextMenu={openContextMenu}
            prompt={prompt}
            setPromptValue={setPromptValue}
            commitPrompt={commitPrompt}
            cancelPrompt={cancelPrompt}
          />
        )}
        {promptError && <p className="px-3 pt-1 text-xs text-red-400">{promptError}</p>}
      </div>

      {menu && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[200] w-44 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50"
          style={{ left: menu.x, top: menu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          {menu.node && !menu.node.isDirectory && (
            <ContextMenuButton onClick={() => openNote(menu.node!)}>Open</ContextMenuButton>
          )}
          {menu.node && !menu.node.isDirectory && (
            <ContextMenuButton onClick={() => openMarkdownPreview(menu.node!)}>
              View in Markdown Viewer
            </ContextMenuButton>
          )}
          <ContextMenuButton onClick={() => startCreate('note', menu.node)}>New Note</ContextMenuButton>
          <ContextMenuButton onClick={() => startCreate('folder', menu.node)}>
            New {root ? folderLabel(depthOf(targetDirectory(menu.node) ?? root, root) + 1) : 'Folder'}
          </ContextMenuButton>
          {menu.node && (
            <>
              <ContextMenuDivider />
              <ContextMenuButton onClick={() => startRename(menu.node!)}>Rename</ContextMenuButton>
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
            Move the {root ? (deleteTarget.isDirectory ? folderLabel(depthOf(deleteTarget.path, root)) : 'Note').toLowerCase() : ''}{' '}
            <span className="font-mono text-fg break-all">
              {deleteTarget.isDirectory ? deleteTarget.name : noteDisplayName(deleteTarget.name)}
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
    </div>
  )
}
