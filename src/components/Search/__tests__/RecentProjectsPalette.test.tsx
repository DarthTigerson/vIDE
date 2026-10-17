import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { RecentProjectsPalette } from '../RecentProjectsPalette'
import { useFileStore } from '@/stores/fileStore'

vi.mock('@/lib/platform', () => ({ isMac: true }))

const RECENTS = [
  { path: '/Users/thomas/vide', lastOpened: 3 },
  { path: '/Users/thomas/other-project', lastOpened: 2 },
  { path: '/Users/thomas/dotfiles', lastOpened: 1 },
]

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  (global as any).window.api = {
    recentProjectsList: vi.fn().mockResolvedValue(RECENTS),
    openProjectInNewWindow: vi.fn().mockResolvedValue(undefined),
    focusProjectIfOpen: vi.fn().mockResolvedValue(false),
  }
  useFileStore.setState({ openRecentProject: vi.fn().mockResolvedValue(undefined), projectRoot: '/Users/thomas/current' })
})

afterEach(() => {
  cleanup()
})

describe('RecentProjectsPalette', () => {
  it('lists recent projects with name and full path', async () => {
    render(<RecentProjectsPalette onClose={() => {}} />)
    expect(await screen.findByText('vide')).toBeTruthy()
    expect(screen.getByText('/Users/thomas/vide')).toBeTruthy()
    expect(screen.getByText('other-project')).toBeTruthy()
    expect(screen.getByText('dotfiles')).toBeTruthy()
  })

  it('shows an empty state when there are no recent projects', async () => {
    vi.mocked(window.api.recentProjectsList).mockResolvedValueOnce([])
    render(<RecentProjectsPalette onClose={() => {}} />)
    expect(await screen.findByText('No recent projects')).toBeTruthy()
  })

  it('filters by typed query', async () => {
    render(<RecentProjectsPalette onClose={() => {}} />)
    await screen.findByText('vide')
    fireEvent.change(screen.getByPlaceholderText('Switch project…'), { target: { value: 'dot' } })
    expect(screen.getByText('dotfiles')).toBeTruthy()
    expect(screen.queryByText('vide')).toBeNull()
  })

  it('Enter opens the selected project in a new window, never replacing this one', async () => {
    useFileStore.setState({ projectRoot: '/Users/thomas/current' })
    const onClose = vi.fn()
    render(<RecentProjectsPalette onClose={onClose} />)
    await screen.findByText('vide')
    fireEvent.keyDown(screen.getByPlaceholderText('Switch project…'), { key: 'Enter' })
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(window.api.openProjectInNewWindow).toHaveBeenCalledWith('/Users/thomas/vide')
    expect(useFileStore.getState().openRecentProject).not.toHaveBeenCalled()
  })

  it('Cmd+Enter also opens a new window', async () => {
    useFileStore.setState({ projectRoot: '/Users/thomas/current' })
    render(<RecentProjectsPalette onClose={() => {}} />)
    await screen.findByText('vide')
    fireEvent.keyDown(screen.getByPlaceholderText('Switch project…'), { key: 'Enter', metaKey: true })
    await vi.waitFor(() => expect(window.api.openProjectInNewWindow).toHaveBeenCalledWith('/Users/thomas/vide'))
    expect(useFileStore.getState().openRecentProject).not.toHaveBeenCalled()
  })

  it('opens here when this window has no project yet (no empty window left behind)', async () => {
    useFileStore.setState({ projectRoot: null })
    render(<RecentProjectsPalette onClose={() => {}} />)
    await screen.findByText('vide')
    fireEvent.keyDown(screen.getByPlaceholderText('Switch project…'), { key: 'Enter' })
    await vi.waitFor(() => expect(useFileStore.getState().openRecentProject).toHaveBeenCalledWith('/Users/thomas/vide'))
    expect(window.api.openProjectInNewWindow).not.toHaveBeenCalled()
  })

  it('ArrowDown moves selection to the next project before Enter', async () => {
    render(<RecentProjectsPalette onClose={() => {}} />)
    await screen.findByText('vide')
    const input = screen.getByPlaceholderText('Switch project…')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    await vi.waitFor(() => expect(window.api.openProjectInNewWindow).toHaveBeenCalledWith('/Users/thomas/other-project'))
  })

  it('Enter focuses an already-open window instead of loading it here', async () => {
    vi.mocked(window.api.focusProjectIfOpen).mockResolvedValueOnce(true)
    const onClose = vi.fn()
    render(<RecentProjectsPalette onClose={onClose} />)
    await screen.findByText('vide')
    fireEvent.keyDown(screen.getByPlaceholderText('Switch project…'), { key: 'Enter' })
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(window.api.focusProjectIfOpen).toHaveBeenCalledWith('/Users/thomas/vide')
    expect(useFileStore.getState().openRecentProject).not.toHaveBeenCalled()
    expect(window.api.openProjectInNewWindow).not.toHaveBeenCalled()
  })

  it('Cmd+Enter also focuses an already-open window instead of spawning a new one', async () => {
    vi.mocked(window.api.focusProjectIfOpen).mockResolvedValueOnce(true)
    const onClose = vi.fn()
    render(<RecentProjectsPalette onClose={onClose} />)
    await screen.findByText('vide')
    fireEvent.keyDown(screen.getByPlaceholderText('Switch project…'), { key: 'Enter', metaKey: true })
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(window.api.openProjectInNewWindow).not.toHaveBeenCalled()
    expect(useFileStore.getState().openRecentProject).not.toHaveBeenCalled()
  })

  it('Escape closes without opening anything', async () => {
    const onClose = vi.fn()
    render(<RecentProjectsPalette onClose={onClose} />)
    await screen.findByText('vide')
    fireEvent.keyDown(screen.getByPlaceholderText('Switch project…'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    expect(useFileStore.getState().openRecentProject).not.toHaveBeenCalled()
  })
})
