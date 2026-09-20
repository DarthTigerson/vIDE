import { describe, it, expect, beforeEach, vi } from 'vitest'
import { openFileInTree } from '../openFileInTree'
import { useEditorStore } from '@/stores/editorStore'
import { usePanelRequestStore } from '@/stores/panelRequestStore'
import { useSidebarUiStore } from '@/stores/sidebarUiStore'

let readFile: ReturnType<typeof vi.fn>

beforeEach(() => {
  readFile = vi.fn().mockResolvedValue('file contents')
  vi.stubGlobal('window', { api: { readFile } })
  useEditorStore.setState({
    tabs: [{ path: 'git-diff://unstaged/x', content: '', dirty: false }],
    activeTabPath: 'git-diff://unstaged/x',
    layout: { type: 'pane', id: 'pane-1' },
    activePaneId: 'pane-1',
    paneTabs: { 'pane-1': 'git-diff://unstaged/x' },
    paneTabLists: { 'pane-1': ['git-diff://unstaged/x'] },
    closedTabs: [],
    pinnedPaths: new Set(),
  } as any)
  usePanelRequestStore.setState({ request: null })
  useSidebarUiStore.setState({ revealRequest: null })
})

describe('openFileInTree', () => {
  it('opens the file as a new tab next to the existing one, keeping the diff tab', async () => {
    await openFileInTree('/proj/src/a.ts', 'pane-1')
    const { tabs, paneTabLists } = useEditorStore.getState()
    expect(tabs.find((t) => t.path === '/proj/src/a.ts')?.content).toBe('file contents')
    expect(tabs.some((t) => t.path === 'git-diff://unstaged/x')).toBe(true)
    expect(paneTabLists['pane-1']).toEqual(['git-diff://unstaged/x', '/proj/src/a.ts'])
    expect(useEditorStore.getState().activeTabPath).toBe('/proj/src/a.ts')
  })

  it('requests the file tree panel (App applies it to the real left panel) and asks it to reveal the file', async () => {
    await openFileInTree('/proj/src/a.ts', 'pane-1')
    expect(usePanelRequestStore.getState().request?.panel).toBe('files')
    expect(useSidebarUiStore.getState().revealRequest).toEqual({ path: '/proj/src/a.ts', expandTarget: undefined })
  })

  it('leaves the panel and tabs untouched when the file cannot be read', async () => {
    readFile.mockRejectedValue(new Error('ENOENT'))
    await expect(openFileInTree('/proj/gone.ts', 'pane-1')).rejects.toThrow('ENOENT')
    expect(usePanelRequestStore.getState().request).toBeNull()
    expect(useSidebarUiStore.getState().revealRequest).toBeNull()
    expect(useEditorStore.getState().tabs).toHaveLength(1)
  })
})
