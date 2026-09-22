import { describe, it, expect, beforeEach, vi } from 'vitest'

// Importing Editor.tsx pulls in the whole editor module graph, and several of
// those stores touch window.api at module-init — before any beforeEach runs.
// The stub therefore has to exist at hoist time, not test time.
const { api } = vi.hoisted(() => {
  const api: Record<string, any> = {
    saveFileDialog: vi.fn(),
    writeFile: vi.fn(),
    pathExists: vi.fn(),
    readDir: vi.fn().mockResolvedValue([]),
    gitStatus: vi.fn().mockResolvedValue({ staged: [], unstaged: [] }),
    gitListIgnored: vi.fn().mockResolvedValue([]),
    // Module-init side effects of stores pulled in by Editor.tsx's import
    // graph; stubbed only so they resolve instead of rejecting unhandled.
    browserMcpDisable: vi.fn().mockResolvedValue(undefined),
    notesMcpDisable: vi.fn().mockResolvedValue(undefined),
    browserMcpEnable: vi.fn().mockResolvedValue(undefined),
    notesMcpEnable: vi.fn().mockResolvedValue(undefined),
  }
  // Assign onto the existing jsdom window — replacing it with a spread copy
  // drops prototype methods the stores need (matchMedia, addEventListener).
  ;(globalThis as any).window.api = api
  return { api }
})

import { saveActiveTab } from '../Editor'
import { useEditorStore } from '@/stores/editorStore'
import { useFileStore } from '@/stores/fileStore'
import { buildScratchPath } from '../paths'

const SCRATCH = buildScratchPath('abc')

beforeEach(() => {
  api.saveFileDialog.mockReset().mockResolvedValue('/project/notes.md')
  api.writeFile.mockReset().mockResolvedValue(undefined)
  api.pathExists.mockReset().mockResolvedValue(true)
  useFileStore.setState({ projectRoot: '/project' })
  useEditorStore.setState({
    tabs: [{ path: SCRATCH, content: 'hello', dirty: true }],
    activeTabPath: SCRATCH,
    layout: { type: 'pane', id: 'pane-1' },
    activePaneId: 'pane-1',
    paneTabs: { 'pane-1': SCRATCH },
    paneTabLists: { 'pane-1': [SCRATCH] },
    closedTabs: [],
    pinnedPaths: new Set(),
  })
})

describe('saveActiveTab — scratch tab Save As', () => {
  it('asks where to save, writes there, and re-keys the tab to the real path', async () => {
    await saveActiveTab({ allowCreateMissing: true })

    expect(api.saveFileDialog).toHaveBeenCalledWith('/project')
    expect(api.writeFile).toHaveBeenCalledWith('/project/notes.md', 'hello')

    const tab = useEditorStore.getState().tabs[0]
    expect(tab.path).toBe('/project/notes.md')
    expect(tab.content).toBe('hello')
    expect(tab.dirty).toBe(false)
  })

  it('leaves the tab untouched and still dirty when the dialog is cancelled', async () => {
    api.saveFileDialog.mockResolvedValue(null)
    await saveActiveTab({ allowCreateMissing: true })

    expect(api.writeFile).not.toHaveBeenCalled()
    const tab = useEditorStore.getState().tabs[0]
    expect(tab.path).toBe(SCRATCH)
    expect(tab.dirty).toBe(true)
  })

  // A scratch tab has no file on disk, so the missing-file probe that guards
  // normal saves must not run against its scratch:// path.
  it('never probes the filesystem for the scratch path', async () => {
    await saveActiveTab({ allowCreateMissing: false })
    expect(api.pathExists).not.toHaveBeenCalled()
  })
})
