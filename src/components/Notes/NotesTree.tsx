import type { DragEvent, MouseEvent } from 'react'
import type { FileNode } from '@/types/index'
import type { DropPlacement } from '@/lib/notesSort'
import { FolderIcon } from '@/components/Sidebar/FileIcon'
import { DiaryPageIcon } from './DiaryPageIcon'
import { BookIcon } from './BookIcon'
import { ChapterIcon } from './ChapterIcon'
import { treeRowDropTargetClass } from '@/components/ui/panelDrop'

export type NotesPromptKind = 'note' | 'folder' | 'rename'

export interface NotesPromptState {
  kind: NotesPromptKind
  value: string
  directory: string
  node: FileNode | null
  // Human label for the thing being created/renamed — "Book"/"Chapter"/"Folder"
  // for a directory (depending on depth) or "Note" for a note.
  label: string
}

// Drag-to-reorder, only passed in Manual sort.
export interface NotesReorder {
  draggingNode: FileNode | null
  setDraggingNode: (node: FileNode | null) => void
  dropMarker: { path: string; placement: DropPlacement } | null
  setDropMarker: (marker: { path: string; placement: DropPlacement } | null) => void
  onPlaceNode: (source: FileNode, target: FileNode, placement: DropPlacement) => void
}

type RowDropZone = DropPlacement | 'into' | null

// Where a drag over `node`'s row would land. Without Manual sort only folders
// take drops (into). In Manual, a note row splits top/bottom into before/after;
// a folder row keeps its middle for "into" and its outer quarters for
// reordering. Folders stay above notes, so a folder never goes beside a note.
function rowDropZone(event: DragEvent<HTMLElement>, node: FileNode, reorder: NotesReorder | null): RowDropZone {
  const source = reorder?.draggingNode
  if (!reorder || !source) return node.isDirectory ? 'into' : null
  if (source.path === node.path) return null
  if (source.isDirectory !== node.isDirectory) return node.isDirectory ? 'into' : null
  const rect = event.currentTarget.getBoundingClientRect()
  const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5
  if (node.isDirectory) return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'into'
  return ratio < 0.5 ? 'before' : 'after'
}

interface NotesTreeProps {
  nodes: FileNode[]
  directoryPath: string
  depth?: number
  expandedPaths: Set<string>
  childrenByDir: Record<string, FileNode[]>
  activeNotePath: string | null
  onToggle: (node: FileNode) => void
  onOpenNote: (node: FileNode) => void
  onContextMenu: (event: MouseEvent, node: FileNode) => void
  prompt: NotesPromptState | null
  setPromptValue: (value: string) => void
  commitPrompt: () => void
  cancelPrompt: () => void
  dragOverPath: string | null
  setDragOverPath: (path: string | null) => void
  onMoveNode: (sourcePath: string, targetDir: string) => void
  // The folder's entries in display order (the Notes sort setting).
  sortNodes: (directoryPath: string, nodes: FileNode[]) => FileNode[]
  reorder: NotesReorder | null
}

function noteDisplayName(name: string): string {
  return name.endsWith('.md') ? name.slice(0, -3) : name
}

function FolderKindIcon({ depth, open }: { depth: number; open: boolean }) {
  if (depth === 0) return <BookIcon open={open} />
  if (depth === 1) return <ChapterIcon open={open} />
  return <FolderIcon open={open} />
}

function InlineNameInput({ prompt, depth, setPromptValue, commitPrompt, cancelPrompt }: {
  prompt: NotesPromptState
  depth: number
  setPromptValue: (value: string) => void
  commitPrompt: () => void
  cancelPrompt: () => void
}) {
  const isFolder = prompt.kind === 'folder' || prompt.node?.isDirectory
  return (
    <div
      className="flex items-center gap-1 py-0.5"
      style={{ paddingLeft: `${8 + depth * 12}px`, paddingRight: '8px' }}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <span className="shrink-0 text-xs w-3 text-fg-subtle" />
      {isFolder ? <FolderKindIcon depth={depth} open={false} /> : <DiaryPageIcon />}
      <input
        value={prompt.value}
        onChange={(event) => setPromptValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commitPrompt()
          if (event.key === 'Escape') cancelPrompt()
        }}
        onBlur={cancelPrompt}
        autoFocus
        placeholder={`${prompt.label.toLowerCase()} name`}
        className="min-w-0 flex-1 rounded border border-accent bg-panel px-1 py-0 text-sm text-fg outline-none placeholder:text-fg-subtle"
        style={{ userSelect: 'text' }}
      />
    </div>
  )
}

export function NotesTree({
  nodes,
  directoryPath,
  depth = 0,
  expandedPaths,
  childrenByDir,
  activeNotePath,
  onToggle,
  onOpenNote,
  onContextMenu,
  prompt,
  setPromptValue,
  commitPrompt,
  cancelPrompt,
  dragOverPath,
  setDragOverPath,
  onMoveNode,
  sortNodes,
  reorder,
}: NotesTreeProps) {
  const createPromptHere = prompt && !prompt.node && prompt.directory === directoryPath

  function handleClick(node: FileNode) {
    if (node.isDirectory) {
      onToggle(node)
    } else {
      onOpenNote(node)
    }
  }

  return (
    <ul>
      {createPromptHere && (
        <li>
          <InlineNameInput
            prompt={prompt}
            depth={depth}
            setPromptValue={setPromptValue}
            commitPrompt={commitPrompt}
            cancelPrompt={cancelPrompt}
          />
        </li>
      )}
      {sortNodes(directoryPath, nodes).map((node) => (
        <li key={node.path}>
          {prompt?.kind === 'rename' && prompt.node?.path === node.path ? (
            <InlineNameInput
              prompt={prompt}
              depth={depth}
              setPromptValue={setPromptValue}
              commitPrompt={commitPrompt}
              cancelPrompt={cancelPrompt}
            />
          ) : (
            <button
              id={`file-tree-node:${node.path}`}
              type="button"
              draggable
              className={`relative flex items-center gap-1 w-full text-left py-0.5 text-sm hover:bg-white/5 rounded truncate ${
                activeNotePath === node.path ? 'bg-accent/20 text-fg' : 'text-fg'
              } ${dragOverPath === node.path ? treeRowDropTargetClass : ''}`}
              style={{ paddingLeft: `${8 + depth * 12}px`, paddingRight: '8px' }}
              onClick={() => handleClick(node)}
              onContextMenu={(event) => onContextMenu(event, node)}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', node.path)
                reorder?.setDraggingNode(node)
              }}
              onDragOver={(event) => {
                const zone = rowDropZone(event, node, reorder)
                if (!zone) return
                event.preventDefault()
                event.stopPropagation()
                event.dataTransfer.dropEffect = 'move'
                if (zone === 'into') {
                  reorder?.setDropMarker(null)
                  if (dragOverPath !== node.path) setDragOverPath(node.path)
                } else {
                  setDragOverPath(null)
                  if (reorder?.dropMarker?.path !== node.path || reorder.dropMarker.placement !== zone) {
                    reorder?.setDropMarker({ path: node.path, placement: zone })
                  }
                }
              }}
              onDrop={(event) => {
                const zone = rowDropZone(event, node, reorder)
                if (!zone) return
                event.preventDefault()
                event.stopPropagation()
                setDragOverPath(null)
                reorder?.setDropMarker(null)
                if (zone !== 'into') {
                  if (reorder?.draggingNode) reorder.onPlaceNode(reorder.draggingNode, node, zone)
                  return
                }
                const sourcePath = event.dataTransfer.getData('text/plain')
                if (sourcePath) onMoveNode(sourcePath, node.path)
              }}
            >
              <span className="shrink-0 text-xs w-3 text-fg-subtle">
                {node.isDirectory ? (expandedPaths.has(node.path) ? '▾' : '▸') : ''}
              </span>
              {node.isDirectory ? (
                <FolderKindIcon depth={depth} open={expandedPaths.has(node.path)} />
              ) : (
                <DiaryPageIcon />
              )}
              <span className={`truncate text-fg ${node.isDirectory && depth === 0 ? 'font-semibold' : ''}`}>
                {node.isDirectory ? node.name : noteDisplayName(node.name)}
              </span>
              {reorder?.dropMarker?.path === node.path && (
                <span
                  data-testid="notes-drop-marker"
                  className={`pointer-events-none absolute left-2 right-2 h-0.5 bg-accent rounded ${
                    reorder.dropMarker.placement === 'before' ? 'top-0' : 'bottom-0'
                  }`}
                />
              )}
            </button>
          )}
          {node.isDirectory && expandedPaths.has(node.path) && childrenByDir[node.path] && (
            <NotesTree
              nodes={childrenByDir[node.path]}
              directoryPath={node.path}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              childrenByDir={childrenByDir}
              activeNotePath={activeNotePath}
              onToggle={onToggle}
              onOpenNote={onOpenNote}
              onContextMenu={onContextMenu}
              prompt={prompt}
              setPromptValue={setPromptValue}
              commitPrompt={commitPrompt}
              cancelPrompt={cancelPrompt}
              dragOverPath={dragOverPath}
              setDragOverPath={setDragOverPath}
              onMoveNode={onMoveNode}
              sortNodes={sortNodes}
              reorder={reorder}
            />
          )}
        </li>
      ))}
    </ul>
  )
}
