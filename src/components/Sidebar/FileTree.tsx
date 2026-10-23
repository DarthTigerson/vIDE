import type { MouseEvent } from 'react'
import type { FileNode } from '@/types/index'
import { useFileStore } from '@/stores/fileStore'
import { useEditorStore } from '@/stores/editorStore'
import { useTabDragStore } from '@/stores/tabDragStore'
import { useEditorSettingsStore } from '@/stores/editorSettingsStore'
import { useRepoGitState } from '@/stores/gitStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { isGitDiffTab, parseGitDiffPath, isGitCommitDiffTab, parseGitCommitDiffPath } from '@/components/Git/paths'
import {
  buildImagePreviewPath,
  isImagePreviewTab,
  parseImagePreviewPath,
  isMarkdownPreviewTab,
  parseMarkdownPreviewPath,
  buildMarkdownPreviewPath,
} from '@/components/Viewer/paths'
import { isImageFile, isMarkdownFile } from '@/lib/fileKinds'
import { isIgnoredPath } from '@/lib/gitIgnore'
import { FileIcon, FolderIcon } from './FileIcon'
import { isExternalFileDrag } from './treeUtils'
import { useGitTreeDecorations } from './useGitTreeDecorations'
import { useGeneralSettingsStore } from '@/stores/generalSettingsStore'
import { treeRowDropTargetClass } from '@/components/ui/panelDrop'
import { isRuleHidden, isTreeVisible, relativePath } from '@/lib/treeHiding'
import { selectRules, useTreeHidingStore } from '@/stores/treeHidingStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'

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
  // The row a right-click menu is open for; it keeps its hover look so it's
  // clear which item the menu acts on.
  menuPath?: string | null
  prompt: TreePromptState | null
  setPromptValue: (value: string) => void
  commitPrompt: () => void
  cancelPrompt: () => void
  dragOverPath: string | null
  setDragOverPath: (path: string | null) => void
  onMoveNode: (sourcePath: string, targetDir: string) => void
  onDropExternal: (files: File[], targetDir: string) => void
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
  menuPath,
  prompt,
  setPromptValue,
  commitPrompt,
  cancelPrompt,
  dragOverPath,
  setDragOverPath,
  onMoveNode,
  onDropExternal,
}: FileTreeProps) {
  const { select, expandDir, collapseDir } = useFileStore()
  const expandedPaths = useFileStore((s) => s.expandedPaths)
  const projectRoot = useFileStore((s) => s.projectRoot)
  const revealedPath = useFileStore((s) => s.revealedPath)
  const selectedRepo = useGitReposStore((s) => s.selectedRepo)
  const ignoredPaths = useRepoGitState(selectedRepo).ignoredPaths
  const { files: fileGitDecorations, folders: folderGitAggregates } = useGitTreeDecorations()
  const hideRules = useTreeHidingStore((s) => selectRules(s.byRepo, projectRoot))
  const graphifyEnabled = useGraphifySettingsStore((s) => s.enabled)
  // Settings > General > File Tree: 'letter' keeps names their normal colour.
  const colourGitNames = useGeneralSettingsStore((s) => s.fileTreeGitStatus === 'letterAndColour')
  const { activeTabPath, openTab, openTabInNewSplitPane } = useEditorStore()
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
      select(node.path)
      if (expandedPaths.has(node.path)) {
        collapseDir(node.path)
      } else {
        await expandDir(node.path)
      }
    } else if (isImageFile(node.name)) {
      select(node.path)
      openTab({ path: buildImagePreviewPath(node.path), content: '', dirty: false })
    } else if (isMarkdownFile(node.name)) {
      select(node.path)
      const mode = useEditorSettingsStore.getState().markdownOpenMode
      if (mode === 'preview') {
        openTab({ path: buildMarkdownPreviewPath(node.path), content: '', dirty: false })
        return
      }
      const content = await window.api.readFile(node.path)
      openTab({ path: node.path, content, dirty: false })
      if (mode === 'split') {
        const landedPaneId = useEditorStore.getState().activePaneId
        openTabInNewSplitPane(
          { path: buildMarkdownPreviewPath(node.path), content: '', dirty: false },
          landedPaneId,
          'horizontal',
          'after'
        )
      }
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
        const rel = projectRoot ? relativePath(projectRoot, node.path) : null
        if (rel && !isTreeVisible(rel, node.isDirectory, ignored, hideRules, graphifyEnabled)) return null
        // Only reachable while "Hidden items" is switched on.
        const ruleHidden = !!rel && isRuleHidden(rel, node.isDirectory, hideRules)
        // Folders show the dominant color of whatever's changed inside them
        // (an aggregate, so no single-letter badge); files show their own
        // status's color + letter directly. Both come from the same
        // memoized per-repo lookup — no recompute or tree walk per row.
        const gitDecoration = node.isDirectory
          ? folderGitAggregates.get(node.path)
          : fileGitDecorations.get(node.path)
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
                  activeFilePath === node.path ? 'bg-accent/20 text-fg' : menuPath === node.path ? 'bg-white/5 text-fg' : 'text-fg'
                } ${ignored || ruleHidden ? 'opacity-45' : ''} ${ruleHidden ? 'italic' : ''} ${
                  revealedPath === node.path ? 'ring-1 ring-inset ring-accent/70' : ''
                } ${dragOverPath === node.path ? treeRowDropTargetClass : ''}`}
                style={{ paddingLeft: `${8 + depth * 12}px`, paddingRight: '8px' }}
                onClick={() => handleClick(node)}
                onContextMenu={(event) => onContextMenu(event, node)}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', node.path)
                  // Files can also be dropped on an editor pane to open or split.
                  if (!node.isDirectory) {
                    event.dataTransfer.setData('application/x-vide-file', node.path)
                    useTabDragStore.getState().startFileDrag(node.path)
                  }
                }}
                onDragEnd={() => useTabDragStore.getState().endDrag()}
                onDragOver={(event) => {
                  if (!node.isDirectory) return
                  event.preventDefault()
                  event.stopPropagation()
                  event.dataTransfer.dropEffect = isExternalFileDrag(event.dataTransfer) ? 'copy' : 'move'
                  if (dragOverPath !== node.path) setDragOverPath(node.path)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setDragOverPath(null)
                  // The move below can unmount the dragged row before its dragend fires.
                  useTabDragStore.getState().endDrag()
                  if (!node.isDirectory) return
                  if (isExternalFileDrag(event.dataTransfer)) {
                    const files = Array.from(event.dataTransfer.files)
                    if (files.length > 0) onDropExternal(files, node.path)
                    return
                  }
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
                <span className={`truncate flex-1 min-w-0 ${gitDecoration && colourGitNames ? gitDecoration.textClass : 'text-fg'}`}>
                  {node.name}
                </span>
                {ruleHidden && <span className="shrink-0 text-[0.625rem] not-italic text-fg-subtle">hidden</span>}
                {!node.isDirectory && gitDecoration && (
                  <span className={`shrink-0 text-xs font-semibold ${gitDecoration.textClass}`}>
                    {gitDecoration.letter}
                  </span>
                )}
                {/* Folders have no letter, so a dot marks changes inside (in both Letter modes). */}
                {node.isDirectory && gitDecoration && (
                  <span
                    data-git-folder-dot
                    aria-hidden
                    className={`shrink-0 mr-0.5 h-1.5 w-1.5 rounded-full bg-current ${gitDecoration.textClass}`}
                  />
                )}
              </button>
            )}
            {node.isDirectory && expandedPaths.has(node.path) && node.children && (
              <FileTree
                nodes={node.children}
                directoryPath={node.path}
                depth={depth + 1}
                onContextMenu={onContextMenu}
                menuPath={menuPath}
                prompt={prompt}
                setPromptValue={setPromptValue}
                commitPrompt={commitPrompt}
                cancelPrompt={cancelPrompt}
                dragOverPath={dragOverPath}
                setDragOverPath={setDragOverPath}
                onMoveNode={onMoveNode}
                onDropExternal={onDropExternal}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}
