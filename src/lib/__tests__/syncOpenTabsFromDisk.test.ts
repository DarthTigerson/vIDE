import { describe, it, expect, beforeEach, vi } from 'vitest'
import { syncOpenTabsFromDisk } from '../syncOpenTabsFromDisk'
import { useEditorStore } from '@/stores/editorStore'
import { buildScratchPath } from '@/components/Editor/paths'

const SCRATCH = buildScratchPath('abc')
const REAL = '/project/src/a.ts'
let readFile: ReturnType<typeof vi.fn>

beforeEach(() => {
  readFile = vi.fn().mockResolvedValue('from disk')
  vi.stubGlobal('window', { api: { readFile } })
  useEditorStore.setState({
    tabs: [
      { path: REAL, content: 'old', dirty: false },
      { path: SCRATCH, content: 'notes', dirty: false },
    ],
    activeTabPath: REAL,
    layout: { type: 'pane', id: 'pane-1' },
    activePaneId: 'pane-1',
    paneTabs: { 'pane-1': REAL },
    paneTabLists: { 'pane-1': [REAL, SCRATCH] },
    closedTabs: [],
    pinnedPaths: new Set(),
  } as any)
})

describe('syncOpenTabsFromDisk', () => {
  it('never reads a scratch tab from disk', async () => {
    await syncOpenTabsFromDisk()
    expect(readFile).toHaveBeenCalledWith(REAL)
    expect(readFile).not.toHaveBeenCalledWith(SCRATCH)
  })

  it('leaves scratch content untouched', async () => {
    await syncOpenTabsFromDisk()
    const tabs = useEditorStore.getState().tabs
    expect(tabs.find((t) => t.path === SCRATCH)?.content).toBe('notes')
    expect(tabs.find((t) => t.path === REAL)?.content).toBe('from disk')
  })
})
