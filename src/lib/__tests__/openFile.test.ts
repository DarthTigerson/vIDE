import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.hoisted(() => {
  const data = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
})

vi.mock('@/lib/notifySettingChanged', () => ({ notifySettingChanged: vi.fn() }))

import { routeFile, resolveFileTab, openFile } from '../openFile'
import { openFileAtLocation } from '../openFileLocation'
import { useEditorStore } from '@/stores/editorStore'
import { useExtensionsStore } from '@/stores/extensionsStore'

let readFile: ReturnType<typeof vi.fn>

beforeEach(() => {
  readFile = vi.fn().mockResolvedValue('file contents')
  vi.stubGlobal('window', { api: { readFile } })
  useExtensionsStore.setState({
    enabled: { 'image-viewer': true },
  })
  useEditorStore.setState({
    tabs: [],
    activeTabPath: null,
    layout: { type: 'pane', id: 'pane-1' },
    activePaneId: 'pane-1',
    paneTabs: { 'pane-1': null },
    paneTabLists: { 'pane-1': [] },
    closedTabs: [],
    pinnedPaths: new Set(),
  } as never)
})

describe('routeFile', () => {
  it.each(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'avif', 'ico', 'tif', 'tiff', 'heic', 'heif'])(
    'opens .%s in the image viewer',
    (ext) => {
      expect(routeFile(`/p/a.${ext}`)).toEqual({ kind: 'image', tabPath: `image-preview:///p/a.${ext}` })
    },
  )

  it('opens .svg in the image viewer, or as text when the source is wanted', () => {
    expect(routeFile('/p/a.svg')).toEqual({ kind: 'image', tabPath: 'image-preview:///p/a.svg' })
    expect(routeFile('/p/a.svg', { source: true })).toEqual({ kind: 'text', tabPath: '/p/a.svg' })
  })

  it('opens other files as text', () => {
    expect(routeFile('/p/a.ts')).toEqual({ kind: 'text', tabPath: '/p/a.ts' })
  })

  it('keeps markdown as text unless the editor open mode is asked for', () => {
    expect(routeFile('/p/a.md')).toEqual({ kind: 'text', tabPath: '/p/a.md' })
    expect(routeFile('/p/a.md', { markdownMode: 'preview' })).toEqual({ kind: 'markdown', tabPath: 'markdown-preview:///p/a.md' })
    expect(routeFile('/p/a.md', { markdownMode: 'editor' })).toEqual({ kind: 'text', tabPath: '/p/a.md' })
  })

  it('routes to a notice tab when the extension is off, even for a source request', () => {
    useExtensionsStore.getState().setEnabled('image-viewer', false)
    expect(routeFile('/p/a.png')).toEqual({ kind: 'notice', tabPath: 'extension-off://image-viewer//p/a.png', extensionId: 'image-viewer' })
    expect(routeFile('/p/a.tiff').kind).toBe('notice')
    expect(routeFile('/p/a.svg').kind).toBe('notice')
    expect(routeFile('/p/a.svg', { source: true }).kind).toBe('notice')
    expect(routeFile('/p/a.ts').kind).toBe('text')
  })

})

describe('resolveFileTab', () => {
  it('never reads an image or notice file', async () => {
    await resolveFileTab('/p/a.png')
    await resolveFileTab('/p/a.heic')
    await resolveFileTab('/p/a.svg')
    useExtensionsStore.getState().setEnabled('image-viewer', false)
    await resolveFileTab('/p/b.png')
    expect(readFile).not.toHaveBeenCalled()
  })

  it('reads a text file, and reuses an already open tab content', async () => {
    expect(await resolveFileTab('/p/a.ts')).toEqual({ path: '/p/a.ts', content: 'file contents', dirty: false })
    useEditorStore.getState().openTab({ path: '/p/b.ts', content: 'unsaved', dirty: true })
    readFile.mockClear()
    expect(await resolveFileTab('/p/b.ts')).toEqual({ path: '/p/b.ts', content: 'unsaved', dirty: true })
    expect(readFile).not.toHaveBeenCalled()
  })
})

describe('openFile', () => {
  it('opens a raster image and an SVG in the image viewer, never as text', async () => {
    await openFile('/p/a.png')
    await openFile('/p/b.svg')
    expect(useEditorStore.getState().paneTabLists['pane-1']).toEqual(['image-preview:///p/a.png', 'image-preview:///p/b.svg'])
    expect(readFile).not.toHaveBeenCalled()
  })

  it('opens a notice tab for a disabled extension', async () => {
    useExtensionsStore.getState().setEnabled('image-viewer', false)
    await openFile('/p/a.png')
    expect(useEditorStore.getState().paneTabLists['pane-1']).toEqual(['extension-off://image-viewer//p/a.png'])
  })

  it('opens in the given pane', async () => {
    useEditorStore.setState({
      layout: { type: 'split', direction: 'horizontal', children: [{ type: 'pane', id: 'pane-1' }, { type: 'pane', id: 'pane-2' }] },
      paneTabs: { 'pane-1': null, 'pane-2': null },
      paneTabLists: { 'pane-1': [], 'pane-2': [] },
    } as never)
    await openFile('/p/a.png', { paneId: 'pane-2' })
    expect(useEditorStore.getState().paneTabLists['pane-2']).toEqual(['image-preview:///p/a.png'])
  })

  it('splits Markdown only in split mode', async () => {
    await openFile('/p/a.md', { markdownMode: 'editor' })
    expect(Object.values(useEditorStore.getState().paneTabLists).flat()).toEqual(['/p/a.md'])
    await openFile('/p/b.md', { markdownMode: 'split' })
    expect(Object.values(useEditorStore.getState().paneTabLists).flat()).toContain('markdown-preview:///p/b.md')
  })
})

describe('openFileAtLocation (chat links, go-to-definition, search)', () => {
  it('opens a .png in the image viewer, not as text', async () => {
    await openFileAtLocation('/p/shot.png')
    expect(useEditorStore.getState().paneTabLists['pane-1']).toEqual(['image-preview:///p/shot.png'])
    expect(readFile).not.toHaveBeenCalled()
  })

  it('ignores a line on an image and sets no reveal', async () => {
    await openFileAtLocation('/p/shot.png', 4, 2)
    expect(useEditorStore.getState().paneTabLists['pane-1']).toEqual(['image-preview:///p/shot.png'])
    expect(useEditorStore.getState().revealRequest).toBeNull()
  })

  it('shows the notice for a disabled image extension', async () => {
    useExtensionsStore.getState().setEnabled('image-viewer', false)
    await openFileAtLocation('/p/shot.png')
    expect(useEditorStore.getState().paneTabLists['pane-1']).toEqual(['extension-off://image-viewer//p/shot.png'])
  })

  it('opens an SVG as source for a line jump, and in the image viewer otherwise', async () => {
    await openFileAtLocation('/p/a.svg', 3, 1)
    expect(useEditorStore.getState().paneTabLists['pane-1']).toEqual(['/p/a.svg'])
    expect(useEditorStore.getState().revealRequest?.path).toBe('/p/a.svg')
    await openFileAtLocation('/p/b.svg')
    expect(useEditorStore.getState().paneTabLists['pane-1']).toContain('image-preview:///p/b.svg')
  })

  it('still opens code as text and reveals the line', async () => {
    await openFileAtLocation('/p/a.ts', 7, 3, 'foo')
    expect(useEditorStore.getState().tabs[0]).toMatchObject({ path: '/p/a.ts', content: 'file contents' })
    expect(useEditorStore.getState().revealRequest).toEqual({ path: '/p/a.ts', line: 7, col: 3, searchTerm: 'foo' })
  })
})
