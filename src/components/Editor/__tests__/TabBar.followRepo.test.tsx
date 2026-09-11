import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TabBar } from '../TabBar'
import { useEditorStore } from '@/stores/editorStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitOpenReposStore } from '@/stores/gitOpenReposStore'

afterEach(() => {
  cleanup()
})

function setupSingleTab(path: string) {
  useEditorStore.setState({
    tabs: [{ path, content: '', dirty: false }],
    activeTabPath: path,
    layout: { type: 'pane', id: 'pane-1' },
    activePaneId: 'pane-1',
    paneTabs: { 'pane-1': path },
    paneTabLists: { 'pane-1': [path] },
    closedTabs: [],
    pinnedPaths: new Set(),
  })
}

// Reported bug: the footer/Git-panel "current repo" got stuck on whatever
// repo a Git-panel action button was last clicked on (e.g. Fetch on repoB),
// even after returning attention to an editor tab that belongs to a
// different repo (repoA) — because App.tsx's activeTabPath-change effect
// never re-fires for a tab that's already active (Zustand skips notifying
// subscribers when a selector's value is unchanged), so nothing else
// resynced selectedRepo back to what the user was actually editing.
describe('TabBar — re-clicking a tab resyncs the current git repo', () => {
  it('re-clicking the already-active tab reasserts its repo as selectedRepo', () => {
    useGitReposStore.setState({ repos: ['/proj/repoA', '/proj/repoB'], selectedRepo: '/proj/repoB', hasExplicitSelection: true })
    useGitOpenReposStore.setState({ open: {} })
    setupSingleTab('/proj/repoA/file.ts')

    render(<TabBar paneId="pane-1" />)
    // The tab is already active — clicking it doesn't change activeTabPath at all.
    expect(useEditorStore.getState().activeTabPath).toBe('/proj/repoA/file.ts')
    expect(useGitReposStore.getState().selectedRepo).toBe('/proj/repoB')

    fireEvent.click(screen.getByText('file.ts'))

    expect(useGitReposStore.getState().selectedRepo).toBe('/proj/repoA')
  })

  it('clicking a tab that resolves to no repo (e.g. a non-file tab) leaves selectedRepo untouched', () => {
    useGitReposStore.setState({ repos: ['/proj/repoA'], selectedRepo: '/proj/repoA', hasExplicitSelection: true })
    useGitOpenReposStore.setState({ open: {} })
    setupSingleTab('vide://settings')

    render(<TabBar paneId="pane-1" />)
    fireEvent.click(screen.getByText('settings'))

    expect(useGitReposStore.getState().selectedRepo).toBe('/proj/repoA')
  })
})
