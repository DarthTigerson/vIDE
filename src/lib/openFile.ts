import type { Tab } from '@/types/index'
import { useEditorStore } from '@/stores/editorStore'
import { isImageFile, isMarkdownFile, isSvgFile } from '@/lib/fileKinds'
import { buildImagePreviewPath, buildMarkdownPreviewPath } from '@/components/Viewer/paths'

export type FileRoute = { kind: 'image' | 'markdown' | 'text'; tabPath: string }

// Where opening a file goes: the one decision every entry point shares (file
// tree, drag and drop, chat/search/go-to-definition links, palette, ...), so
// no path can reach Monaco as binary. `source` asks for the editable text of
// an SVG instead of its picture (a jump to a line only makes sense there).
// Markdown opens as text unless `markdownMode` carries the Settings > Editor
// open mode to follow (the file tree and drag and drop pass it).
export interface RouteOptions {
  source?: boolean
  markdownMode?: 'editor' | 'preview' | 'split'
}

export function routeFile(path: string, { source = false, markdownMode }: RouteOptions = {}): FileRoute {
  if (isImageFile(path)) {
    return source && isSvgFile(path) ? { kind: 'text', tabPath: path } : { kind: 'image', tabPath: buildImagePreviewPath(path) }
  }
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
// otherwise, and returns the route it took. The Markdown split mode also
// opens the second half beside it.
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
  if (options.markdownMode === 'split' && isMarkdownFile(path)) {
    useEditorStore.getState().openTabInNewSplitPane(
      { path: buildMarkdownPreviewPath(path), content: '', dirty: false },
      landedPaneId,
      'horizontal',
      'after',
    )
  }
  return route
}
