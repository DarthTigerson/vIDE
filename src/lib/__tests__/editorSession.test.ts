import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { restoredEditorState, useEditorStore, type EditorLayoutNode } from '@/stores/editorStore'
import { useFileStore } from '@/stores/fileStore'
import { buildMarkdownPreviewPath } from '@/components/Viewer/paths'
import { GIT_LOG_TAB_PATH, buildTerminalPath } from '@/components/Settings/paths'
import { fileBehindTab, restoreEditorSession, startEditorSessionPersistence } from '../editorSession'

vi.stubGlobal('window', {
  api: {
    readFile: vi.fn(),
    pathExists: vi.fn(),
    sessionSave: vi.fn(),
  },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
})

const split: EditorLayoutNode = {
  type: 'split',
  direction: 'horizontal',
  children: [{ type: 'pane', id: 'pane-1' }, { type: 'pane', id: 'pane-2' }],
}

function resetEditor() {
  useEditorStore.setState({
    tabs: [],
    activeTabPath: null,
    layout: { type: 'pane', id: 'pane-1' },
    activePaneId: 'pane-1',
    paneTabs: { 'pane-1': null },
    paneTabLists: { 'pane-1': [] },
    closedTabs: [],
  })
}

describe('restoredEditorState', () => {
  it('brings back a split with each pane\'s tabs and active tab', () => {
    const state = restoredEditorState(
      {
        layout: split,
        paneTabLists: { 'pane-1': ['/p/a.ts', '/p/b.ts'], 'pane-2': ['/p/c.ts'] },
        paneTabs: { 'pane-1': '/p/a.ts', 'pane-2': '/p/c.ts' },
        activePaneId: 'pane-2',
      },
      { '/p/a.ts': 'A', '/p/b.ts': 'B', '/p/c.ts': 'C' }
    )
    expect(state).toEqual({
      tabs: [
        { path: '/p/a.ts', content: 'A', dirty: false },
        { path: '/p/b.ts', content: 'B', dirty: false },
        { path: '/p/c.ts', content: 'C', dirty: false },
      ],
      layout: split,
      activePaneId: 'pane-2',
      activeTabPath: '/p/c.ts',
      paneTabs: { 'pane-1': '/p/a.ts', 'pane-2': '/p/c.ts' },
      paneTabLists: { 'pane-1': ['/p/a.ts', '/p/b.ts'], 'pane-2': ['/p/c.ts'] },
    })
  })

  it('drops tabs that cannot come back and collapses a pane left empty', () => {
    const state = restoredEditorState(
      {
        layout: split,
        paneTabLists: { 'pane-1': ['/p/a.ts', '/p/gone.ts'], 'pane-2': [GIT_LOG_TAB_PATH] },
        paneTabs: { 'pane-1': '/p/gone.ts', 'pane-2': GIT_LOG_TAB_PATH },
        activePaneId: 'pane-2',
      },
      { '/p/a.ts': 'A' }
    )
    expect(state?.layout).toEqual({ type: 'pane', id: 'pane-1' })
    expect(state?.paneTabLists).toEqual({ 'pane-1': ['/p/a.ts'] })
    expect(state?.activePaneId).toBe('pane-1')
    expect(state?.activeTabPath).toBe('/p/a.ts')
  })

  it('returns null when nothing survives or the saved layout is unreadable', () => {
    expect(restoredEditorState({ layout: split, paneTabLists: { 'pane-1': ['/p/gone.ts'] } }, {})).toBeNull()
    expect(restoredEditorState({ layout: { type: 'nope' }, paneTabLists: {} }, { '/p/a.ts': 'A' })).toBeNull()
    expect(restoredEditorState({}, { '/p/a.ts': 'A' })).toBeNull()
  })
})

describe('fileBehindTab', () => {
  it('maps file and preview tabs to their file, and everything else to null', () => {
    expect(fileBehindTab('/p/a.ts')).toBe('/p/a.ts')
    expect(fileBehindTab(buildMarkdownPreviewPath('/p/README.md'))).toBe('/p/README.md')
    expect(fileBehindTab(GIT_LOG_TAB_PATH)).toBeNull()
    expect(fileBehindTab('scratch://123')).toBeNull()
  })
})

describe('editor session persistence', () => {
  let stop: () => void

  beforeEach(() => {
    vi.useFakeTimers()
    resetEditor()
    useFileStore.setState({ projectRoot: '/p' })
    vi.mocked(window.api.readFile).mockReset()
    vi.mocked(window.api.pathExists).mockReset()
    vi.mocked(window.api.sessionSave).mockReset()
    stop = startEditorSessionPersistence()
  })

  afterEach(() => {
    stop()
    vi.useRealTimers()
  })

  it('restores file and terminal tabs, reading each file and skipping ones that are gone', async () => {
    vi.mocked(window.api.readFile).mockImplementation(async (path: string) => {
      if (path === '/p/gone.ts') throw new Error('ENOENT')
      return `content of ${path}`
    })
    vi.mocked(window.api.pathExists).mockResolvedValue(true)
    const preview = buildMarkdownPreviewPath('/p/README.md')
    const terminal = buildTerminalPath('abc')

    await restoreEditorSession('/p', {
      layout: { type: 'pane', id: 'pane-1' },
      paneTabLists: { 'pane-1': ['/p/a.ts', '/p/gone.ts', preview, terminal, GIT_LOG_TAB_PATH] },
      paneTabs: { 'pane-1': '/p/a.ts' },
      activePaneId: 'pane-1',
    })

    const { tabs, activeTabPath } = useEditorStore.getState()
    expect(tabs.map((t) => t.path)).toEqual(['/p/a.ts', preview, terminal])
    expect(tabs[0].content).toBe('content of /p/a.ts')
    expect(activeTabPath).toBe('/p/a.ts')
  })

  it('does not save the empty editor before the restore has run', () => {
    useEditorStore.getState().openTab({ path: '/p/x.ts', content: '', dirty: false })
    vi.advanceTimersByTime(1000)
    expect(window.api.sessionSave).not.toHaveBeenCalled()
  })

  it('saves tab changes for the project once restored', async () => {
    await restoreEditorSession('/p', null)
    useEditorStore.getState().openTab({ path: '/p/x.ts', content: '', dirty: false })
    vi.advanceTimersByTime(1000)
    expect(window.api.sessionSave).toHaveBeenCalledWith('/p', expect.objectContaining({
      activeTabPath: '/p/x.ts',
      paneTabLists: { 'pane-1': ['/p/x.ts'] },
    }))
  })

  it('keeps a tab opened while the restore was still loading', async () => {
    let finishRead: (content: string) => void = () => {}
    vi.mocked(window.api.readFile).mockImplementation(() => new Promise((resolve) => { finishRead = resolve }))
    const restoring = restoreEditorSession('/p', {
      layout: { type: 'pane', id: 'pane-1' },
      paneTabLists: { 'pane-1': ['/p/a.ts'] },
    })
    useEditorStore.getState().openTab({ path: '/p/new.ts', content: '', dirty: false })
    finishRead('A')
    await restoring
    expect(useEditorStore.getState().tabs.map((t) => t.path)).toEqual(['/p/new.ts'])
  })

  it('writes a pending change under the project it was made in, even after switching', async () => {
    await restoreEditorSession('/p', null)
    useEditorStore.getState().openTab({ path: '/p/x.ts', content: '', dirty: false })
    useFileStore.setState({ projectRoot: '/q' })
    useEditorStore.getState().resetForNewProject()
    await restoreEditorSession('/q', null)
    vi.advanceTimersByTime(1000)
    expect(window.api.sessionSave).toHaveBeenCalledTimes(1)
    expect(window.api.sessionSave).toHaveBeenCalledWith('/p', expect.objectContaining({ activeTabPath: '/p/x.ts' }))
  })
})
