import type { MouseEvent } from 'react'
import type { FileNode } from '@/types/index'
import { FolderIcon } from '@/components/Sidebar/FileIcon'
import { DiaryPageIcon } from './DiaryPageIcon'
import { BookIcon } from './BookIcon'
import { ChapterIcon } from './ChapterIcon'

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
      {nodes.map((node) => (
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
              type="button"
              className={`flex items-center gap-1 w-full text-left py-0.5 text-sm hover:bg-white/5 rounded truncate ${
                activeNotePath === node.path ? 'bg-accent/20 text-fg' : 'text-fg'
              }`}
              style={{ paddingLeft: `${8 + depth * 12}px`, paddingRight: '8px' }}
              onClick={() => handleClick(node)}
              onContextMenu={(event) => onContextMenu(event, node)}
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
            />
          )}
        </li>
      ))}
    </ul>
  )
}
