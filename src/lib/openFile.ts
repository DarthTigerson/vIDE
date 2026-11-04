import type { Tab } from '@/types/index'
import { useEditorStore } from '@/stores/editorStore'
import { useExtensionsStore } from '@/stores/extensionsStore'
import { extensionForFile, type ExtensionId } from '@/lib/extensions'
import { isMarkdownFile, isRasterImageFile, isSvgFile } from '@/lib/fileKinds'
import {
  buildExtensionOffPath,
  buildImagePreviewPath,
  buildMarkdownPreviewPath,
  buildSvgViewerPath,
} from '@/components/Viewer/paths'

export type FileRoute =
  | { kind: 'image' | 'svg' | 'markdown' | 'text'; tabPath: string }
  | { kind: 'notice'; tabPath: string; extensionId: ExtensionId }

// Where opening a file goes: the one decision every entry point shares (file
// tree, drag and drop, chat/search/go-to-definition links, palette, ...), so
// no path can reach Monaco as binary. `source` asks for the editable text of
// an SVG instead of its viewer (a jump to a line only makes sense there).
// Markdown opens as text unless `markdownMode` carries the Settings > Editor
// open mode to follow (the file tree and drag and drop pass it).
export interface RouteOptions {
  source?: boolean
  markdownMode?: 'editor' | 'preview' | 'split'
}

export function routeFile(path: string, { source = false, markdownMode }: RouteOptions = {}): FileRoute {
  const extension = extensionForFile(path)
  if (extension && !useExtensionsStore.getState().isEnabled(extension.id)) {
    return { kind: 'notice', tabPath: buildExtensionOffPath(extension.id, path), extensionId: extension.id }
  }
  if (isRasterImageFile(path)) return { kind: 'image', tabPath: buildImagePreviewPath(path) }
  if (isSvgFile(path)) {
    return source ? { kind: 'text', tabPath: path } : { kind: 'svg', tabPath: buildSvgViewerPath(path) }
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
// otherwise, and returns the route it took. The Markdown and SVG split modes
// also open the second half beside it.
export async function openFile(
  path: string,
  { paneId, ...options }: RouteOptions & { paneId?: string } = {},
): Promise<FileRoute> {
  const route = routeFile(path, options)
  const tab = await resolveFileTab(path, options)
  const editor = useEditorStore.getState()
  const alreadyOpen = editor.tabs.some((t) => t.path === tab.path)
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
  } else if (route.kind === 'svg' && !alreadyOpen) {
    const extensions = useExtensionsStore.getState()
    extensions.setSvgMode(path, extensions.svgDefaultMode)
    if (extensions.svgDefaultMode === 'split') {
      const source = await resolveFileTab(path, { source: true })
      useEditorStore.getState().openTabInNewSplitPane(source, landedPaneId, 'horizontal', 'before')
    }
  }
  return route
}
