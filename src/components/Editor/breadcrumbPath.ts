import {
  isGitDiffTab, parseGitDiffPath,
  isGitCommitDiffTab, parseGitCommitDiffPath,
} from '@/components/Git/paths'
import { isMarkdownPreviewTab, parseMarkdownPreviewPath } from '@/components/Viewer/paths'

function joinPath(root: string, rel: string): string {
  return root.endsWith('/') ? root + rel : `${root}/${rel}`
}

// The real file path a tab should show in the breadcrumb, or null when the
// tab has no single file to show. Diff and markdown-preview tabs encode their
// file in a scheme (git-diff://, etc.) rather than using it as the tab path,
// so it's parsed back out here. isPlainFileTab is decided by the caller
// (Editor.tsx), which owns the full list of non-file tab kinds.
export function breadcrumbPathForTab(tabPath: string, isPlainFileTab: boolean): string | null {
  if (isPlainFileTab) return tabPath
  if (isMarkdownPreviewTab(tabPath)) return parseMarkdownPreviewPath(tabPath)
  if (isGitDiffTab(tabPath)) {
    const { repoRoot, path } = parseGitDiffPath(tabPath)
    return joinPath(repoRoot, path)
  }
  if (isGitCommitDiffTab(tabPath)) {
    const { repoRoot, path } = parseGitCommitDiffPath(tabPath)
    return joinPath(repoRoot, path)
  }
  return null
}
