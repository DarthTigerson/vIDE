import type { Tab } from '@/types/index'
import { useEditorStore } from '@/stores/editorStore'
import { isImageFile, isMarkdownFile, isPdfFile, isSvgFile } from '@/lib/fileKinds'
import { buildImagePreviewPath, buildMarkdownPreviewPath, buildPdfViewerPath, buildSvgViewerPath } from '@/components/Viewer/paths'

export type FileRoute = { kind: 'image' | 'svg' | 'pdf' | 'markdown' | 'text'; tabPath: string }

// Where opening a file goes: the one decision every entry point shares (file
// tree, drag and drop, chat/search/go-to-definition links, palette, ...), so
// no path can reach Monaco as binary. `source` asks for the editable text of
// an SVG instead of its picture (a jump to a line only makes sense there).
// Markdown opens as text unless `markdownMode` carries the Settings > Editor
// open mode to follow (the file tree and drag and drop pass it). SVG works the
// same through `svgMode`, except it opens in its viewer when no mode is given.
export interface RouteOptions {
  source?: boolean
  markdownMode?: 'editor' | 'preview' | 'split'
  svgMode?: 'editor' | 'preview' | 'split'
}

export function routeFile(path: string, { source = false, markdownMode, svgMode = 'preview' }: RouteOptions = {}): FileRoute {
  if (isSvgFile(path)) {
    return !source && svgMode === 'preview' ? { kind: 'svg', tabPath: buildSvgViewerPath(path) } : { kind: 'text', tabPath: path }
  }
  // Even with `source`: a PDF has no text to edit.
  if (isPdfFile(path)) return { kind: 'pdf', tabPath: buildPdfViewerPath(path) }
  if (isImageFile(path)) return { kind: 'image', tabPath: buildImagePreviewPath(path) }
  if (markdownMode === 'preview' && isMarkdownFile(path)) {
    return { kind: 'markdown', tabPath: buildMarkdownPreviewPath(path) }
  }
  return { kind: 'text', tabPath: path }
}

// The tab for a route, reading the file only when it opens as text. A file
// already open as a tab keeps that tab's (possibly unsaved) content.
export async function resolveFileTab(path: string, options?: RouteOptions): Promise<Tab> {
  const route = routeFile(path, options)
  if (route.tabPath !== path) return { path: route.tabPath, content: '', dirty: false }
  const existing = useEditorStore.getState().tabs.find((t) => t.path === path)
  if (existing) return { path, content: existing.content, dirty: existing.dirty }
  return { path, content: await window.api.readFile(path), dirty: false }
}

// Opens a file by its route, in `paneId` when given or wherever new tabs go
// otherwise, and returns the route it took. The Markdown and SVG split modes
// also open the rendered half beside it.
export async function openFile(
  path: string,
  { paneId, ...options }: RouteOptions & { paneId?: string } = {},
): Promise<FileRoute> {
  const route = routeFile(path, options)
  const tab = await resolveFileTab(path, options)
  const editor = useEditorStore.getState()
  if (paneId) editor.openTabInPane(tab, paneId)
  else editor.openTab(tab)

  const landedPaneId = useEditorStore.getState().activePaneId
  const previewPath =
    options.markdownMode === 'split' && isMarkdownFile(path) ? buildMarkdownPreviewPath(path)
    : !options.source && options.svgMode === 'split' && isSvgFile(path) ? buildSvgViewerPath(path)
    : null
  if (previewPath) {
    useEditorStore.getState().openTabInNewSplitPane(
      { path: previewPath, content: '', dirty: false },
      landedPaneId,
      'horizontal',
      'after',
    )
  }
  return route
}
