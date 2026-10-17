/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { SearchHit } from '../../../../electron/searchTypes'
import { SearchPanel } from '../SearchPanel'
import { useGlobalSearchStore } from '@/stores/globalSearchStore'
import { useFileStore } from '@/stores/fileStore'
import { useEditorStore } from '@/stores/editorStore'
import { useSidebarUiStore } from '@/stores/sidebarUiStore'

function hit(path: string, line: number): SearchHit {
  return { path, line, col: 7, length: 6, text: 'const needle = 1', matchStart: 6 }
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  ;(global as any).window.api = {
    searchStart: vi.fn(),
    searchCancel: vi.fn(),
    onSearchResults: vi.fn(() => () => {}),
    onSearchDone: vi.fn(() => () => {}),
    onFsChanged: vi.fn(() => () => {}),
    readFile: vi.fn().mockResolvedValue('const needle = 1\n'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    revealInFinder: vi.fn().mockResolvedValue(undefined),
    trashPath: vi.fn().mockResolvedValue(undefined),
    writeClipboardFiles: vi.fn().mockResolvedValue(undefined),
    readDir: vi.fn().mockResolvedValue([]),
  }
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
  useGlobalSearchStore.getState().clear()
  useGlobalSearchStore.setState({
    query: 'needle',
    status: 'done',
    groups: [
      { path: '/proj/src/a.ts', hits: [hit('/proj/src/a.ts', 3), hit('/proj/src/a.ts', 9)], stale: false },
      { path: '/proj/b.ts', hits: [hit('/proj/b.ts', 1)], stale: false },
    ],
    matchCount: 3,
    collapsed: {},
    root: '/proj',
    searchId: 's-test',
  })
  useFileStore.setState({ projectRoot: '/proj', refreshTree: vi.fn().mockResolvedValue(undefined) } as any)
  useEditorStore.setState({ tabs: [] })
  useSidebarUiStore.setState({ revealRequest: null })
})

afterEach(() => {
  cleanup()
})

// The file row is the button showing the file name and match count.
function rightClickFileRow(name: string) {
  fireEvent.contextMenu(screen.getByText(name, { selector: 'span' }))
}

function menuItem(name: string) {
  return screen.getByRole('menuitem', { name })
}

describe('SearchPanel — file row right-click menu', () => {
  it('offers the file actions in order', () => {
    render(<SearchPanel />)
    rightClickFileRow('a.ts')
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual([
      'Open / Edit',
      'Reveal in Site Tree',
      'Copy',
      'Copy Path',
      'Reveal in Finder',
      'Move to Trash',
    ])
  })

  it('opens the file itself', async () => {
    render(<SearchPanel />)
    rightClickFileRow('a.ts')
    fireEvent.click(menuItem('Open / Edit'))
    await waitFor(() => expect(useEditorStore.getState().tabs.map((t) => t.path)).toContain('/proj/src/a.ts'))
  })

  it('reveals the file in the file tree', () => {
    render(<SearchPanel />)
    rightClickFileRow('a.ts')
    fireEvent.click(menuItem('Reveal in Site Tree'))
    expect(useSidebarUiStore.getState().revealRequest?.path).toBe('/proj/src/a.ts')
  })

  it('copies the file for pasting in the tree or Finder', async () => {
    render(<SearchPanel />)
    rightClickFileRow('a.ts')
    fireEvent.click(menuItem('Copy'))
    await waitFor(() => expect(window.api.writeClipboardFiles).toHaveBeenCalledWith(['/proj/src/a.ts'], 'copy'))
  })

  it('copies the full path', () => {
    render(<SearchPanel />)
    rightClickFileRow('a.ts')
    fireEvent.click(menuItem('Copy Path'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/proj/src/a.ts')
  })

  it('reveals the file in Finder', () => {
    render(<SearchPanel />)
    rightClickFileRow('a.ts')
    fireEvent.click(menuItem('Reveal in Finder'))
    expect(window.api.revealInFinder).toHaveBeenCalledWith('/proj/src/a.ts')
  })

  it('opens the same menu from a match line, for that line\'s file', () => {
    const { container } = render(<SearchPanel />)
    fireEvent.contextMenu(container.querySelector('[data-hit-key^="/proj/b.ts"]')!)
    fireEvent.click(menuItem('Reveal in Finder'))
    expect(window.api.revealInFinder).toHaveBeenCalledWith('/proj/b.ts')
  })

  it('closes on Escape', () => {
    render(<SearchPanel />)
    rightClickFileRow('a.ts')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('trashes the file only after confirming, and drops it from the results', async () => {
    render(<SearchPanel />)
    rightClickFileRow('a.ts')
    fireEvent.click(menuItem('Move to Trash'))
    expect(window.api.trashPath).not.toHaveBeenCalled()
    expect(screen.getByText(/to the Trash\?/)).toHaveTextContent('a.ts')

    fireEvent.click(screen.getByRole('button', { name: 'Move to Trash' }))

    await waitFor(() => expect(window.api.trashPath).toHaveBeenCalledWith('/proj/src/a.ts'))
    await waitFor(() => expect(screen.queryByText('a.ts', { selector: 'span' })).toBeNull())
    expect(useGlobalSearchStore.getState().matchCount).toBe(1)
  })

  it('does nothing when the trash is cancelled', () => {
    render(<SearchPanel />)
    rightClickFileRow('a.ts')
    fireEvent.click(menuItem('Move to Trash'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(window.api.trashPath).not.toHaveBeenCalled()
    expect(screen.getByText('a.ts', { selector: 'span' })).toBeInTheDocument()
  })
})
