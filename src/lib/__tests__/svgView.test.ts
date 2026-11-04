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

import { applySvgMode, showSvgPreview, showSvgSource } from '../svgView'
import { openFile } from '../openFile'
import { useEditorStore } from '@/stores/editorStore'
import { useExtensionsStore } from '@/stores/extensionsStore'

const FILE = '/p/a.svg'
const VIEWER = 'svg-viewer:///p/a.svg'

const openPaths = () => Object.values(useEditorStore.getState().paneTabLists).flat()

beforeEach(() => {
  vi.stubGlobal('window', { api: { readFile: vi.fn().mockResolvedValue('<svg/>') } })
  useExtensionsStore.setState({
    enabled: { 'image-viewer': true, 'svg-viewer': true },
    svgDefaultMode: 'toggle',
    svgModes: {},
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

describe('SVG modes', () => {
  it('toggle: Edit source swaps the viewer for the editable file and Show preview swaps back', async () => {
    await openFile(FILE)
    expect(openPaths()).toEqual([VIEWER])
    await showSvgSource(FILE)
    expect(openPaths()).toEqual([FILE])
    expect(useEditorStore.getState().tabs[0].content).toBe('<svg/>')
    await showSvgPreview(FILE)
    expect(openPaths()).toEqual([VIEWER])
  })

  it('keeps an edited source tab open when going back to the preview', async () => {
    await openFile(FILE)
    await showSvgSource(FILE)
    useEditorStore.getState().updateContent(FILE, '<svg><g/></svg>')
    await showSvgPreview(FILE)
    expect(openPaths()).toEqual(expect.arrayContaining([VIEWER, FILE]))
    expect(useEditorStore.getState().tabs.find((t) => t.path === FILE)?.dirty).toBe(true)
  })

  it('split: opens the source beside the viewer from either tab', async () => {
    await openFile(FILE)
    await applySvgMode(FILE, 'split', 'pane-1')
    expect(openPaths()).toEqual(expect.arrayContaining([VIEWER, FILE]))
    expect(Object.keys(useEditorStore.getState().paneTabLists)).toHaveLength(2)
    expect(useExtensionsStore.getState().svgModeFor(FILE)).toBe('split')
  })

  it('split from the source tab opens the viewer beside it', async () => {
    await openFile(FILE, { source: true })
    await applySvgMode(FILE, 'split', 'pane-1')
    expect(openPaths()).toEqual(expect.arrayContaining([VIEWER, FILE]))
  })

  it('preview from split closes a clean source tab', async () => {
    await openFile(FILE)
    await applySvgMode(FILE, 'split', 'pane-1')
    await applySvgMode(FILE, 'preview', 'pane-1')
    expect(openPaths()).toEqual([VIEWER])
    expect(useExtensionsStore.getState().svgModeFor(FILE)).toBe('preview')
  })
})

describe('default mode', () => {
  it.each([
    ['preview', [VIEWER]],
    ['toggle', [VIEWER]],
  ] as const)('%s opens only the viewer', async (mode, expected) => {
    useExtensionsStore.setState({ svgDefaultMode: mode })
    await openFile(FILE)
    expect(openPaths()).toEqual(expected)
    expect(useExtensionsStore.getState().svgModeFor(FILE)).toBe(mode)
  })

  it('split opens the viewer and the source', async () => {
    useExtensionsStore.setState({ svgDefaultMode: 'split' })
    await openFile(FILE)
    expect(openPaths()).toEqual(expect.arrayContaining([VIEWER, FILE]))
  })
})
