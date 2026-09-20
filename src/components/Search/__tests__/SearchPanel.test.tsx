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
    readFile: vi.fn().mockResolvedValue('const needle = 1\nreturn needle\n'),
    writeFile: vi.fn().mockResolvedValue(undefined),
  }
  openFileAtLocation.mockClear()
  useGlobalSearchStore.getState().clear()
  useGlobalSearchStore.setState({
    query: '', caseSensitive: false, wholeWord: false, regex: false, include: '', exclude: '', collapsed: {},
    replacement: '', replacing: false, pendingReplaceAll: null, replaceOutcome: null,
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
    await user.click(screen.getByRole('button', { name: /filter by files or folders/i }))
    await user.type(screen.getByRole('textbox', { name: /files to include/i }), 'src/**')
    await user.type(screen.getByRole('textbox', { name: /files to exclude/i }), '*.test.ts')
    expect(useGlobalSearchStore.getState().include).toBe('src/**')
    expect(useGlobalSearchStore.getState().exclude).toBe('*.test.ts')
  })

  it('names each search option on hover (name only, no description), and hides it on leave', async () => {
    const user = userEvent.setup()
    render(<SearchPanel />)
    for (const name of ['Match Case', 'Match Whole Word', 'Use Regular Expression', 'Filter by files or folders']) {
      const button = screen.getByRole('button', { name })
      await user.hover(button)
      expect(screen.getByRole('tooltip').textContent).toBe(name)
      await user.unhover(button)
      expect(screen.queryByRole('tooltip')).toBeNull()
    }
  })

  it('shows a clear button only while there is text, and clearing empties the query and results and refocuses', async () => {
    const user = userEvent.setup()
    render(<SearchPanel />)
    expect(screen.queryByRole('button', { name: /clear search/i })).toBeNull()

    seedResults()
    cleanup()
    render(<SearchPanel />)
    await user.click(screen.getByRole('button', { name: /clear search/i }))

    expect(useGlobalSearchStore.getState().query).toBe('')
    expect(useGlobalSearchStore.getState().groups).toEqual([])
    expect(useGlobalSearchStore.getState().status).toBe('idle')
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: /^search$/i }))
    expect(screen.queryByRole('button', { name: /clear search/i })).toBeNull()
  })

  it('shows a folder icon (not dots) for the files filter', () => {
    render(<SearchPanel />)
    const button = screen.getByRole('button', { name: /filter by files or folders/i })
    expect(button.querySelector('[data-icon="folder"]')).toBeTruthy()
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

describe('SearchPanel — replace', () => {
  const api = () => (window as any).api

  // The panel opens the replace field by itself when there is already
  // replacement text (so it survives switching sidebar panels), so only click
  // the toggle if it is still closed.
  async function openReplace(user: ReturnType<typeof userEvent.setup>) {
    if (screen.queryByRole('textbox', { name: /replace with/i })) return
    await user.click(screen.getByRole('button', { name: /toggle replace/i }))
  }

  it('opens the replace field by itself when there is already replacement text, e.g. after switching panels', () => {
    seedResults({ replacement: 'pin' })
    render(<SearchPanel />)
    expect((screen.getByRole('textbox', { name: /replace with/i }) as HTMLInputElement).value).toBe('pin')
  })

  it('reveals a replace field from a button beside the folder filter, and stores what you type', async () => {
    const user = userEvent.setup()
    render(<SearchPanel />)
    expect(screen.queryByRole('textbox', { name: /replace with/i })).toBeNull()
    await openReplace(user)
    await user.type(screen.getByRole('textbox', { name: /replace with/i }), 'pin')
    expect(useGlobalSearchStore.getState().replacement).toBe('pin')
    await user.click(screen.getByRole('button', { name: /toggle replace/i }))
    expect(screen.queryByRole('textbox', { name: /replace with/i })).toBeNull()
  })

  it('names the replace button on hover, like the other options', async () => {
    const user = userEvent.setup()
    render(<SearchPanel />)
    await user.hover(screen.getByRole('button', { name: /toggle replace/i }))
    expect(screen.getByRole('tooltip').textContent).toBe('Replace')
  })

  it('hints at $1 groups only when regex is on', async () => {
    const user = userEvent.setup()
    render(<SearchPanel />)
    await openReplace(user)
    expect(screen.getByRole('textbox', { name: /replace with/i }).getAttribute('placeholder')).toBe('Replace')
    await user.click(screen.getByRole('button', { name: /regular expression/i }))
    expect(screen.getByRole('textbox', { name: /replace with/i }).getAttribute('placeholder')).toMatch(/\$1/)
  })

  it('disables Replace all until there are results to replace', async () => {
    const user = userEvent.setup()
    render(<SearchPanel />)
    await openReplace(user)
    expect((screen.getByRole('button', { name: /replace all/i }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()

    seedResults({ replacement: 'pin' })
    render(<SearchPanel />)
    await openReplace(user)
    expect((screen.getByRole('button', { name: /replace all/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('asks before replacing everything, with the real counts, and does nothing on cancel', async () => {
    const user = userEvent.setup()
    seedResults({ replacement: 'pin' })
    render(<SearchPanel />)
    await openReplace(user)
    await user.click(screen.getByRole('button', { name: /replace all/i }))

    expect(screen.getByText(/replace 3 matches in 2 files/i)).toBeTruthy()
    expect(api().writeFile).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(screen.queryByText(/replace 3 matches in 2 files/i)).toBeNull()
    expect(api().writeFile).not.toHaveBeenCalled()
  })

  it('says so plainly when replacing with nothing', async () => {
    const user = userEvent.setup()
    seedResults({ replacement: '' })
    render(<SearchPanel />)
    await openReplace(user)
    await user.click(screen.getByRole('button', { name: /replace all/i }))
    expect(screen.getByText(/with nothing/i)).toBeTruthy()
  })

  it('replaces everywhere once confirmed', async () => {
    const user = userEvent.setup()
    api().readFile.mockImplementation(async (path: string) =>
      path === '/proj/src/a.ts' ? 'x\nx\nconst needle = 1\nx\nx\nx\nx\nx\nreturn needle\n' : 'needle()\n')
    seedResults({ replacement: 'pin' })
    render(<SearchPanel />)
    await openReplace(user)
    await user.click(screen.getByRole('button', { name: /replace all/i }))
    await user.click(screen.getByRole('button', { name: /^replace$/i }))

    await screen.findByText(/replaced 3 matches in 2 files/i)
    expect(api().writeFile).toHaveBeenCalledWith('/proj/b.ts', 'pin()\n')
    expect(api().writeFile).toHaveBeenCalledWith(
      '/proj/src/a.ts',
      'x\nx\nconst pin = 1\nx\nx\nx\nx\nx\nreturn pin\n',
    )
  })

  it('offers per-file and per-match replace buttons only while the replace field is open', async () => {
    const user = userEvent.setup()
    seedResults({ replacement: '' })
    render(<SearchPanel />)
    expect(screen.queryByRole('button', { name: /replace in b\.ts/i })).toBeNull()
    await openReplace(user)
    expect(screen.getByRole('button', { name: /replace in b\.ts/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /replace match on line 1 of b\.ts/i })).toBeTruthy()
  })

  it('replaces just one match from its own button', async () => {
    const user = userEvent.setup()
    api().readFile.mockResolvedValue('needle()\n')
    seedResults({ replacement: 'pin' })
    render(<SearchPanel />)
    await openReplace(user)
    await user.click(screen.getByRole('button', { name: /replace match on line 1 of b\.ts/i }))
    await screen.findByText(/replaced 1 match in 1 file/i)
    expect(api().writeFile).toHaveBeenCalledTimes(1)
    expect(api().writeFile).toHaveBeenCalledWith('/proj/b.ts', 'pin()\n')
  })

  it('replaces a whole file from its header button', async () => {
    const user = userEvent.setup()
    api().readFile.mockResolvedValue('needle()\n')
    seedResults({ replacement: 'pin' })
    render(<SearchPanel />)
    await openReplace(user)
    await user.click(screen.getByRole('button', { name: /replace in b\.ts/i }))
    await screen.findByText(/replaced 1 match in 1 file/i)
    expect(api().writeFile).toHaveBeenCalledWith('/proj/b.ts', 'pin()\n')
  })

  it('shows an Undo after a replace and restores the file when used', async () => {
    const user = userEvent.setup()
    api().readFile.mockResolvedValueOnce('needle()\n')
    seedResults({ replacement: 'pin' })
    render(<SearchPanel />)
    await openReplace(user)
    await user.click(screen.getByRole('button', { name: /replace in b\.ts/i }))
    await screen.findByText(/replaced 1 match in 1 file/i)

    api().readFile.mockResolvedValueOnce('pin()\n')
    api().writeFile.mockClear()
    await user.click(screen.getByRole('button', { name: /^undo$/i }))
    expect(api().writeFile).toHaveBeenCalledWith('/proj/b.ts', 'needle()\n')
    expect(screen.queryByRole('button', { name: /^undo$/i })).toBeNull()
  })

  it('pressing Enter in the replace field asks to replace all', async () => {
    const user = userEvent.setup()
    seedResults({ replacement: 'pin' })
    render(<SearchPanel />)
    await openReplace(user)
    await user.click(screen.getByRole('textbox', { name: /replace with/i }))
    await user.keyboard('{Enter}')
    expect(screen.getByText(/replace 3 matches in 2 files/i)).toBeTruthy()
  })

  it('hides the replace buttons while a search is still running', async () => {
    const user = userEvent.setup()
    seedResults({ replacement: 'pin', status: 'searching' })
    render(<SearchPanel />)
    await openReplace(user)
    expect(screen.queryByRole('button', { name: /replace in b\.ts/i })).toBeNull()
    expect((screen.getByRole('button', { name: /replace all/i }) as HTMLButtonElement).disabled).toBe(true)
  })
})

