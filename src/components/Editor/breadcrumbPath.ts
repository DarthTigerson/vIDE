import {
  isGitDiffTab, parseGitDiffPath,
  isGitCommitDiffTab, parseGitCommitDiffPath,
} from '@/components/Git/paths'
import {
  isMarkdownPreviewTab, parseMarkdownPreviewPath,
  isImagePreviewTab, parseImagePreviewPath,
} from '@/components/Viewer/paths'

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

// The file behind a working-tree or commit diff tab, or null for any other tab.
export function diffFilePathForTab(tabPath: string): string | null {
  return isGitDiffTab(tabPath) || isGitCommitDiffTab(tabPath) ? breadcrumbPathForTab(tabPath, false) : null
}

// The real file a tab is showing, for actions like Copy File Path — unwraps
// the scheme-encoded tab kinds and returns null for tabs that aren't a file
// (terminals, settings pages, …), which all carry a "://" scheme.
export function filePathForTab(tabPath: string): string | null {
  if (isImagePreviewTab(tabPath)) return parseImagePreviewPath(tabPath)
  if (!tabPath.includes('://')) return tabPath
  return breadcrumbPathForTab(tabPath, false)
}
