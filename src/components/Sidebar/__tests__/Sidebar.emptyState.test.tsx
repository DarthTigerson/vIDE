/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { Sidebar } from '../Sidebar'
import { useFileStore } from '@/stores/fileStore'

afterEach(() => {
  cleanup()
})

function mockApi(overrides: Partial<typeof window.api> = {}) {
  ;(global as any).window.api = {
    recentProjectsList: vi.fn().mockResolvedValue([]),
    focusProjectIfOpen: vi.fn().mockResolvedValue(false),
    ...overrides,
  }
}

describe('Sidebar — empty state (no folder open)', () => {
  it('shows the Open Folder button', () => {
    mockApi()
    useFileStore.setState({ projectRoot: null, tree: [] })
    render(<Sidebar />)
    expect(screen.getByText('Select a project')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Folder' })).toBeInTheDocument()
  })

  it('lists recent projects inline, most recent first, with no separate button to open a palette', () => {
    mockApi({
      recentProjectsList: vi.fn().mockResolvedValue([
        { path: '/Users/thomas/repo-a', lastOpened: 2 },
        { path: '/Users/thomas/repo-b', lastOpened: 1 },
      ]),
    })
    useFileStore.setState({ projectRoot: null, tree: [] })
    render(<Sidebar />)
    expect(screen.queryByRole('button', { name: 'Recent Projects' })).not.toBeInTheDocument()
    return waitFor(() => {
      expect(screen.getByText('repo-a')).toBeInTheDocument()
      expect(screen.getByText('repo-b')).toBeInTheDocument()
    })
  })

  it('shows nothing extra when there are no recent projects', async () => {
    mockApi()
    useFileStore.setState({ projectRoot: null, tree: [] })
    render(<Sidebar />)
    await waitFor(() => expect(window.api.recentProjectsList).toHaveBeenCalled())
    expect(screen.queryByText('Recent Projects')).not.toBeInTheDocument()
  })

  it('keeps the "Select a project" prompt in the same flex layout regardless of whether there are recent projects (regression: it used to sink to the bottom when the recents list was empty/still loading, since its flex-1 sibling was unmounted instead of just left empty)', async () => {
    mockApi()
    useFileStore.setState({ projectRoot: null, tree: [] })
    render(<Sidebar />)

    // Before the recents fetch resolves, and after it resolves with zero
    // recents, the outer flex column must still have both flex-1 children
    // — the prompt's own wrapper and the (empty) recents-list wrapper —
    // otherwise the prompt's justify-end sinks it to the very bottom.
    const outer = screen.getByText('Select a project').closest('div')?.parentElement
    expect(outer?.children.length).toBe(2)

    await waitFor(() => expect(window.api.recentProjectsList).toHaveBeenCalled())
    expect(outer?.children.length).toBe(2)
  })

  it('clicking a recent project opens it in the current window', async () => {
    mockApi({
      recentProjectsList: vi.fn().mockResolvedValue([{ path: '/Users/thomas/repo-a', lastOpened: 1 }]),
    })
    useFileStore.setState({ projectRoot: null, tree: [] })
    const openRecentProject = vi.fn()
    useFileStore.setState({ openRecentProject } as any)
    render(<Sidebar />)

    const item = await screen.findByText('repo-a')
    fireEvent.click(item)

    await waitFor(() => expect(openRecentProject).toHaveBeenCalledWith('/Users/thomas/repo-a'))
  })

  it('focuses the existing window instead of reopening when the project is already open elsewhere', async () => {
    mockApi({
      recentProjectsList: vi.fn().mockResolvedValue([{ path: '/Users/thomas/repo-a', lastOpened: 1 }]),
      focusProjectIfOpen: vi.fn().mockResolvedValue(true),
    })
    useFileStore.setState({ projectRoot: null, tree: [] })
    const openRecentProject = vi.fn()
    useFileStore.setState({ openRecentProject } as any)
    render(<Sidebar />)

    const item = await screen.findByText('repo-a')
    fireEvent.click(item)

    await waitFor(() => expect(window.api.focusProjectIfOpen).toHaveBeenCalledWith('/Users/thomas/repo-a'))
    expect(openRecentProject).not.toHaveBeenCalled()
  })
})
