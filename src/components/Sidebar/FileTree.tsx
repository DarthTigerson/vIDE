import type { MouseEvent } from 'react'
import type { FileNode } from '@/types/index'
import { useFileStore } from '@/stores/fileStore'
import { useEditorStore } from '@/stores/editorStore'
import { useRepoGitState } from '@/stores/gitStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { isGitDiffTab, parseGitDiffPath, isGitCommitDiffTab, parseGitCommitDiffPath } from '@/components/Git/paths'
import {
  buildImagePreviewPath,
  isImagePreviewTab,
  parseImagePreviewPath,
  isMarkdownPreviewTab,
  parseMarkdownPreviewPath,
} from '@/components/Viewer/paths'
import { isImageFile } from '@/lib/fileKinds'
import { isIgnoredPath } from '@/lib/gitIgnore'
import { FileIcon, FolderIcon } from './FileIcon'

export type TreePromptKind = 'file' | 'directory' | 'rename'

export interface TreePromptState {
  kind: TreePromptKind
  value: string
  directory: string
  node: FileNode | null
}

interface FileTreeProps {
  nodes: FileNode[]
  directoryPath: string
  depth?: number
  onContextMenu: (event: MouseEvent, node: FileNode) => void
  prompt: TreePromptState | null
  setPromptValue: (value: string) => void
  commitPrompt: () => void
  cancelPrompt: () => void
  dragOverPath: string | null
  setDragOverPath: (path: string | null) => void
  onMoveNode: (sourcePath: string, targetDir: string) => void
}

function InlineNameInput({ prompt, depth, setPromptValue, commitPrompt, cancelPrompt }: {
  prompt: TreePromptState
  depth: number
  setPromptValue: (value: string) => void
  commitPrompt: () => void
  cancelPrompt: () => void
}) {
  return (
    <div
      className="flex items-center gap-1 py-0.5"
      style={{ paddingLeft: `${8 + depth * 12}px`, paddingRight: '8px' }}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <span className="shrink-0 text-xs w-3 text-fg-subtle" />
      {prompt.kind === 'directory' || prompt.node?.isDirectory ? (
        <FolderIcon open={false} />
      ) : (
        <FileIcon name={prompt.value || 'file'} />
      )}
      <input
        value={prompt.value}
        onChange={(event) => setPromptValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commitPrompt()
          if (event.key === 'Escape') cancelPrompt()
        }}
        onBlur={cancelPrompt}
        autoFocus
        placeholder={prompt.kind === 'directory' ? 'folder-name' : 'filename.ext'}
        className="min-w-0 flex-1 rounded border border-accent bg-panel px-1 py-0 text-sm text-fg outline-none placeholder:text-fg-subtle"
        style={{ userSelect: 'text' }}
      />
    </div>
  )
}

export function FileTree({
  nodes,
  directoryPath,
  depth = 0,
  onContextMenu,
  prompt,
  setPromptValue,
  commitPrompt,
  cancelPrompt,
  dragOverPath,
  setDragOverPath,
  onMoveNode,
}: FileTreeProps) {
  const { select, expandDir, collapseDir } = useFileStore()
  const expandedPaths = useFileStore((s) => s.expandedPaths)
  const projectRoot = useFileStore((s) => s.projectRoot)
  const revealedPath = useFileStore((s) => s.revealedPath)
  const selectedRepo = useGitReposStore((s) => s.selectedRepo)
  const ignoredPaths = useRepoGitState(selectedRepo).ignoredPaths
  const { activeTabPath, openTab } = useEditorStore()
  // isGitDiffTab/isGitCommitDiffTab both carry a repo-*relative* path (that's
  // what git status/git show hand back, and what getDiffContent's own
  // HEAD:<path> git refs require) — has to be re-joined to the diff tab's
  // own repoRoot before it can match node.path, which is always absolute.
  const activeFilePath = !activeTabPath
    ? null
    : isGitDiffTab(activeTabPath)
      ? `${parseGitDiffPath(activeTabPath).repoRoot}/${parseGitDiffPath(activeTabPath).path}`
      : isGitCommitDiffTab(activeTabPath)
        ? `${parseGitCommitDiffPath(activeTabPath).repoRoot}/${parseGitCommitDiffPath(activeTabPath).path}`
        : isImagePreviewTab(activeTabPath)
          ? parseImagePreviewPath(activeTabPath)
          : isMarkdownPreviewTab(activeTabPath)
            ? parseMarkdownPreviewPath(activeTabPath)
            : activeTabPath.includes('://')
              ? null
              : activeTabPath
  const createPromptHere = prompt && !prompt.node && prompt.directory === directoryPath

  async function handleClick(node: FileNode) {
    useFileStore.getState().clearRevealedPath()
    if (node.isDirectory) {
      if (expandedPaths.has(node.path)) {
        collapseDir(node.path)
      } else {
        await expandDir(node.path)
      }
    } else if (isImageFile(node.name)) {
      select(node.path)
      openTab({ path: buildImagePreviewPath(node.path), content: '', dirty: false })
    } else {
      select(node.path)
      const content = await window.api.readFile(node.path)
      openTab({ path: node.path, content, dirty: false })
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
      {nodes.map((node) => {
        const ignored = !!selectedRepo && isIgnoredPath(node.path, selectedRepo, ignoredPaths)
        return (
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
                draggable
                className={`flex items-center gap-1 w-full text-left py-0.5 text-sm hover:bg-white/5 rounded truncate ${
                  activeFilePath === node.path ? 'bg-accent/20 text-fg' : 'text-fg'
                } ${ignored ? 'opacity-45' : ''} ${
                  revealedPath === node.path ? 'ring-1 ring-inset ring-accent/70' : ''
                } ${dragOverPath === node.path ? 'ring-1 ring-inset ring-accent bg-accent/10' : ''}`}
                style={{ paddingLeft: `${8 + depth * 12}px`, paddingRight: '8px' }}
                onClick={() => handleClick(node)}
                onContextMenu={(event) => onContextMenu(event, node)}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', node.path)
                }}
                onDragOver={(event) => {
                  if (!node.isDirectory) return
                  event.preventDefault()
                  event.stopPropagation()
                  event.dataTransfer.dropEffect = 'move'
                  if (dragOverPath !== node.path) setDragOverPath(node.path)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setDragOverPath(null)
                  if (!node.isDirectory) return
                  const sourcePath = event.dataTransfer.getData('text/plain')
                  if (sourcePath) onMoveNode(sourcePath, node.path)
                }}
              >
                <span className="shrink-0 text-xs w-3 text-fg-subtle">
                  {node.isDirectory
                    ? expandedPaths.has(node.path)
                      ? '▾'
                      : '▸'
                    : ''}
                </span>
                {node.isDirectory ? (
                  <FolderIcon open={expandedPaths.has(node.path)} />
                ) : (
                  <FileIcon name={node.name} />
                )}
                <span className="truncate text-fg">
                  {node.name}
                </span>
              </button>
            )}
            {node.isDirectory && expandedPaths.has(node.path) && node.children && (
              <FileTree
                nodes={node.children}
                directoryPath={node.path}
                depth={depth + 1}
                onContextMenu={onContextMenu}
                prompt={prompt}
                setPromptValue={setPromptValue}
                commitPrompt={commitPrompt}
                cancelPrompt={cancelPrompt}
                dragOverPath={dragOverPath}
                setDragOverPath={setDragOverPath}
                onMoveNode={onMoveNode}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}
