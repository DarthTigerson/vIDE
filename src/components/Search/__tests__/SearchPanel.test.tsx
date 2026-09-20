import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SearchHit } from '../../../../electron/searchTypes'

const { openFileAtLocation } = vi.hoisted(() => ({ openFileAtLocation: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/openFileLocation', () => ({ openFileAtLocation }))

import { SearchPanel } from '../SearchPanel'
import { useGlobalSearchStore } from '@/stores/globalSearchStore'
import { useFileStore } from '@/stores/fileStore'
import { useEditorStore } from '@/stores/editorStore'

function hit(path: string, line: number, text: string, matchStart: number, length: number): SearchHit {
  return { path, line, col: matchStart + 1, length, text, matchStart }
}

const A1 = hit('/proj/src/a.ts', 3, 'const needle = 1', 6, 6)
const A2 = hit('/proj/src/a.ts', 9, 'return needle', 7, 6)
const B1 = hit('/proj/b.ts', 1, 'needle()', 0, 6)

function seedResults(overrides: Partial<ReturnType<typeof useGlobalSearchStore.getState>> = {}) {
  useGlobalSearchStore.setState({
    query: 'needle',
    status: 'done',
    error: null,
    truncated: false,
    groups: [
      { path: '/proj/src/a.ts', hits: [A1, A2], stale: false },
      { path: '/proj/b.ts', hits: [B1], stale: false },
    ],
    matchCount: 3,
    diskChanged: false,
    collapsed: {},
    activeKey: null,
    searchId: 's-test',
    root: '/proj',
    ...overrides,
  })
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  ;(global as any).window.api = {
    searchStart: vi.fn(),
    searchCancel: vi.fn(),
    onSearchResults: vi.fn(() => () => {}),
    onSearchDone: vi.fn(() => () => {}),
    onFsChanged: vi.fn(() => () => {}),
  }
  openFileAtLocation.mockClear()
  useGlobalSearchStore.getState().clear()
  useGlobalSearchStore.setState({
    query: '', caseSensitive: false, wholeWord: false, regex: false, include: '', exclude: '', collapsed: {},
  })
  useFileStore.setState({ projectRoot: '/proj' })
  useEditorStore.setState({ tabs: [] })
})

afterEach(() => {
  cleanup()
})

describe('SearchPanel', () => {
  it('shows a hint before anything is searched, and asks for a folder when none is open', () => {
    render(<SearchPanel />)
    expect(screen.getByText(/type to search/i)).toBeTruthy()
    cleanup()

    useFileStore.setState({ projectRoot: null })
    render(<SearchPanel />)
    expect(screen.getByText(/open a folder/i)).toBeTruthy()
  })

  it('writes what you type into the store', async () => {
    const user = userEvent.setup()
    render(<SearchPanel />)
    await user.type(screen.getByRole('textbox', { name: /^search$/i }), 'abc')
    expect(useGlobalSearchStore.getState().query).toBe('abc')
  })

  it('lists results grouped by file with counts and a highlighted match', () => {
    seedResults()
    render(<SearchPanel />)

    expect(screen.getByText(/3 results in 2 files/i)).toBeTruthy()
    const group = screen.getByRole('button', { name: /a\.ts/ })
    expect(within(group).getByText('2')).toBeTruthy()

    const marks = document.querySelectorAll('mark')
    expect(marks).toHaveLength(3)
    expect([...marks].map((m) => m.textContent)).toEqual(['needle', 'needle', 'needle'])
  })

  it('shows the relative directory next to the file name', () => {
    seedResults()
    render(<SearchPanel />)
    expect(screen.getByText('src')).toBeTruthy()
  })

  it('opens a hit on click and leaves the result list exactly as it was', async () => {
    const user = userEvent.setup()
    seedResults()
    render(<SearchPanel />)

    await user.click(screen.getByText(/return/, { selector: 'span' }).closest('button')!)

    expect(openFileAtLocation).toHaveBeenCalledWith('/proj/src/a.ts', 9, 8, 'needle')
    expect(screen.getByText(/3 results in 2 files/i)).toBeTruthy()
    expect(document.querySelectorAll('mark')).toHaveLength(3)
  })

  it('keeps its results when the panel is unmounted and mounted again', () => {
    seedResults()
    const first = render(<SearchPanel />)
    first.unmount()
    render(<SearchPanel />)
    expect(screen.getByText(/3 results in 2 files/i)).toBeTruthy()
    expect((screen.getByRole('textbox', { name: /^search$/i }) as HTMLInputElement).value).toBe('needle')
  })

  it('collapses and expands a file group', async () => {
    const user = userEvent.setup()
    seedResults()
    render(<SearchPanel />)
    await user.click(screen.getByRole('button', { name: /a\.ts/ }))
    expect(document.querySelectorAll('mark')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: /a\.ts/ }))
    expect(document.querySelectorAll('mark')).toHaveLength(3)
  })

  it('has case / whole-word / regex toggles that reflect and flip store state', async () => {
    const user = userEvent.setup()
    render(<SearchPanel />)
    for (const [name, key] of [
      [/match case/i, 'caseSensitive'],
      [/whole word/i, 'wholeWord'],
      [/regular expression/i, 'regex'],
    ] as const) {
      const button = screen.getByRole('button', { name })
      expect(button.getAttribute('aria-pressed')).toBe('false')
      await user.click(button)
      expect((useGlobalSearchStore.getState() as any)[key]).toBe(true)
      expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('true')
    }
  })

  it('reveals include/exclude fields on demand and writes them to the store', async () => {
    const user = userEvent.setup()
    render(<SearchPanel />)
    expect(screen.queryByRole('textbox', { name: /files to include/i })).toBeNull()
    await user.click(screen.getByRole('button', { name: /toggle search details/i }))
    await user.type(screen.getByRole('textbox', { name: /files to include/i }), 'src/**')
    await user.type(screen.getByRole('textbox', { name: /files to exclude/i }), '*.test.ts')
    expect(useGlobalSearchStore.getState().include).toBe('src/**')
    expect(useGlobalSearchStore.getState().exclude).toBe('*.test.ts')
  })

  it('marks files edited since the search with a "changed" badge', () => {
    seedResults({
      groups: [
        { path: '/proj/src/a.ts', hits: [A1, A2], stale: true },
        { path: '/proj/b.ts', hits: [B1], stale: false },
      ],
    })
    render(<SearchPanel />)
    expect(screen.getAllByText(/changed/i)).toHaveLength(1)
  })

  it('offers a refresh when files changed on disk, which re-runs the search', async () => {
    const user = userEvent.setup()
    seedResults({ diskChanged: true })
    render(<SearchPanel />)
    expect(screen.getByText(/changed on disk/i)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /refresh/i }))
    expect((window as any).api.searchStart).toHaveBeenCalledTimes(1)
  })

  it('shows errors, truncation and empty results distinctly', () => {
    seedResults({ status: 'error', error: 'regex parse error', groups: [], matchCount: 0 })
    render(<SearchPanel />)
    expect(screen.getByText(/regex parse error/i)).toBeTruthy()
    cleanup()

    seedResults({ truncated: true })
    render(<SearchPanel />)
    expect(screen.getByText(/first 10,000/i)).toBeTruthy()
    cleanup()

    seedResults({ groups: [], matchCount: 0 })
    render(<SearchPanel />)
    expect(screen.getByText(/no results/i)).toBeTruthy()
  })

  it('moves the active result with the arrow keys and opens it with Enter', async () => {
    const user = userEvent.setup()
    seedResults()
    render(<SearchPanel />)
    const input = screen.getByRole('textbox', { name: /^search$/i })
    await user.click(input)
    await user.keyboard('{ArrowDown}{ArrowDown}')
    await user.keyboard('{Enter}')
    expect(openFileAtLocation).toHaveBeenCalledWith('/proj/src/a.ts', 9, 8, 'needle')
  })
})
