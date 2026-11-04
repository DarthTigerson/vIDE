import { useEditorStore } from '@/stores/editorStore'
import { useExtensionsStore, type SvgMode } from '@/stores/extensionsStore'
import { resolveFileTab } from '@/lib/openFile'
import { buildSvgViewerPath } from '@/components/Viewer/paths'

// An SVG is two tabs over one file: the viewer tab (svg-viewer://, rendered
// from the live buffer) and the file's normal editor tab, so saving, dirty
// state and the git gutter all work on the source. The modes are just
// different arrangements of those two.

function viewerTab(filePath: string) {
  return { path: buildSvgViewerPath(filePath), content: '', dirty: false }
}

function isOpen(path: string): boolean {
  return useEditorStore.getState().tabs.some((t) => t.path === path)
}

// The source tab closes with the preview unless it has unsaved edits.
function closeSourceIfClean(filePath: string): void {
  const source = useEditorStore.getState().tabs.find((t) => t.path === filePath)
  if (source && !source.dirty) useEditorStore.getState().closeTabEverywhere(filePath)
}

// Shows the rendered preview in place of the source (or just focuses it).
export async function showSvgPreview(filePath: string): Promise<void> {
  const editor = useEditorStore.getState()
  if (isOpen(buildSvgViewerPath(filePath)) || !isOpen(filePath)) editor.openTab(viewerTab(filePath))
  else editor.openTabAfter(viewerTab(filePath), filePath)
  closeSourceIfClean(filePath)
}

// Shows the editable source in place of the preview.
export async function showSvgSource(filePath: string): Promise<void> {
  const viewerPath = buildSvgViewerPath(filePath)
  const source = await resolveFileTab(filePath, { source: true })
  useEditorStore.getState().openTabAfter(source, viewerPath)
  useEditorStore.getState().closeTabEverywhere(viewerPath)
}

// Switches an open SVG to a mode. `paneId` is the pane the switcher was used
// in, where a split opens its second half beside.
export async function applySvgMode(filePath: string, mode: SvgMode, paneId: string): Promise<void> {
  useExtensionsStore.getState().setSvgMode(filePath, mode)
  const viewerPath = buildSvgViewerPath(filePath)
  if (mode === 'split') {
    const viewerOpen = isOpen(viewerPath)
    const sourceOpen = isOpen(filePath)
    if (viewerOpen && sourceOpen) return
    const editor = useEditorStore.getState()
    if (viewerOpen) {
      const source = await resolveFileTab(filePath, { source: true })
      editor.openTabInNewSplitPane(source, paneId, 'horizontal', 'before')
    } else {
      editor.openTabInNewSplitPane(viewerTab(filePath), paneId, 'horizontal', 'after')
    }
    return
  }
  await showSvgPreview(filePath)
}
