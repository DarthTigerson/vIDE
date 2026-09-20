import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { SearchBatch, SearchDone, SearchHit } from '../../../electron/searchTypes'

// The store wires its window.api listeners once, lazily, on first use — so the
// mock (and the callbacks it captures) has to outlive individual tests.
const { api, listeners } = vi.hoisted(() => {
  const listeners: {
    results: ((b: any) => void) | null
    done: ((d: any) => void) | null
    fs: ((cwd: string) => void) | null
  } = { results: null, done: null, fs: null }
  const api = {
    searchStart: vi.fn(),
    searchCancel: vi.fn(),
    onSearchResults: vi.fn((cb: (b: any) => void) => { listeners.results = cb; return () => {} }),
    onSearchDone: vi.fn((cb: (d: any) => void) => { listeners.done = cb; return () => {} }),
    onFsChanged: vi.fn((cb: (cwd: string) => void) => { listeners.fs = cb; return () => {} }),
    readFile: vi.fn(),
  }
  return { api, listeners }
})
vi.stubGlobal('window', { api })

import { useGlobalSearchStore, hitKey } from '../globalSearchStore'
import { useEditorStore } from '../editorStore'
import { useFileStore } from '../fileStore'

const ROOT = '/proj'

function hit(path: string, line: number, text = 'const needle = 1', col = 7): SearchHit {
  return { path, line, col, length: 6, text, matchStart: 6 }
}

function lastStart() {
  const call = api.searchStart.mock.calls.at(-1)!
  return { id: call[0] as string, root: call[1] as string, options: call[2] as any }
}

function deliver(id: string, hits: SearchHit[]) {
  listeners.results!({ searchId: id, hits } satisfies SearchBatch)
}

function finish(id: string, extra: Partial<SearchDone> = {}) {
  listeners.done!({ searchId: id, fileCount: 0, matchCount: 0, truncated: false, ...extra } satisfies SearchDone)
}

function reset() {
  useGlobalSearchStore.getState().clear()
  useGlobalSearchStore.setState({
    query: '', caseSensitive: false, wholeWord: false, regex: false, include: '', exclude: '', collapsed: {},
  })
  useFileStore.setState({ projectRoot: ROOT })
  useEditorStore.setState({ tabs: [], revealRequest: null })
}

beforeEach(() => {
  vi.useFakeTimers()
  api.searchStart.mockClear()
  api.searchCancel.mockClear()
  api.readFile.mockReset()
  reset()
  api.searchStart.mockClear()
  api.searchCancel.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('globalSearchStore — running a search', () => {
  it('does nothing for an empty query and clears any old results', () => {
    const s = useGlobalSearchStore.getState()
    s.setQuery('needle')
    vi.advanceTimersByTime(300)
    deliver(lastStart().id, [hit('/proj/a.ts', 1)])
    api.searchStart.mockClear()

    useGlobalSearchStore.getState().setQuery('   ')
    vi.advanceTimersByTime(1000)
    expect(api.searchStart).not.toHaveBeenCalled()
    expect(useGlobalSearchStore.getState().groups).toEqual([])
    expect(useGlobalSearchStore.getState().status).toBe('idle')
  })

  it('debounces typing, then starts one search with the current options', () => {
    const s = useGlobalSearchStore.getState()
    s.setQuery('n')
    s.setQuery('ne')
    s.setQuery('needle')
    vi.advanceTimersByTime(299)
    expect(api.searchStart).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(api.searchStart).toHaveBeenCalledTimes(1)
    const { root, options } = lastStart()
    expect(root).toBe(ROOT)
    expect(options).toMatchObject({ query: 'needle', caseSensitive: false, wholeWord: false, regex: false, include: '', exclude: '', skipPaths: [] })
    expect(useGlobalSearchStore.getState().status).toBe('searching')
  })

  it('re-runs immediately when a toggle changes and a query is present', () => {
    useGlobalSearchStore.getState().setQuery('needle')
    vi.advanceTimersByTime(300)
    api.searchStart.mockClear()
    useGlobalSearchStore.getState().toggle('wholeWord')
    expect(api.searchStart).toHaveBeenCalledTimes(1)
    expect(lastStart().options.wholeWord).toBe(true)
  })

  it('groups streamed batches by file and ignores batches from a superseded search', () => {
    useGlobalSearchStore.getState().setQuery('needle')
    vi.advanceTimersByTime(300)
    const first = lastStart().id
    useGlobalSearchStore.getState().setQuery('needle2')
    vi.advanceTimersByTime(300)
    const second = lastStart().id
    expect(second).not.toBe(first)

    deliver(first, [hit('/proj/stale.ts', 1)])
    deliver(second, [hit('/proj/a.ts', 1), hit('/proj/b.ts', 2)])
    deliver(second, [hit('/proj/a.ts', 9)])

    const { groups, matchCount } = useGlobalSearchStore.getState()
    expect(groups.map((g) => [g.path, g.hits.length])).toEqual([['/proj/a.ts', 2], ['/proj/b.ts', 1]])
    expect(matchCount).toBe(3)
  })

  it('records completion, truncation and errors', () => {
    useGlobalSearchStore.getState().setQuery('needle')
    vi.advanceTimersByTime(300)
    finish(lastStart().id, { truncated: true })
    expect(useGlobalSearchStore.getState()).toMatchObject({ status: 'done', truncated: true, error: null })

    useGlobalSearchStore.getState().toggle('regex')
    finish(lastStart().id, { error: 'regex parse error' })
    expect(useGlobalSearchStore.getState()).toMatchObject({ status: 'error', error: 'regex parse error' })
  })

  it('cancels the running search when the query is cleared', () => {
    useGlobalSearchStore.getState().setQuery('needle')
    vi.advanceTimersByTime(300)
    const id = lastStart().id
    useGlobalSearchStore.getState().setQuery('')
    expect(api.searchCancel).toHaveBeenCalledWith(id)
  })
})

describe('globalSearchStore — unsaved tabs', () => {
  it('searches dirty tabs from memory, skips them in ripgrep, and merges the results', () => {
    useEditorStore.setState({
      tabs: [
        { path: '/proj/dirty.ts', content: 'x\nconst needle = 2\n', dirty: true },
        { path: '/proj/clean.ts', content: 'needle', dirty: false },
        { path: 'git-diff://something', content: 'needle', dirty: true },
      ] as any,
    })
    useGlobalSearchStore.getState().setQuery('needle')
    vi.advanceTimersByTime(300)

    const { id, options } = lastStart()
    expect(options.skipPaths).toEqual(['/proj/dirty.ts'])

    deliver(id, [hit('/proj/other.ts', 3)])
    const { groups } = useGlobalSearchStore.getState()
    expect(groups.map((g) => g.path)).toEqual(['/proj/dirty.ts', '/proj/other.ts'])
    expect(groups[0].hits[0]).toMatchObject({ line: 2, col: 7 })
  })

  it('respects include/exclude when searching dirty tabs', () => {
    useEditorStore.setState({
      tabs: [{ path: '/proj/notes.md', content: 'needle', dirty: true }] as any,
    })
    useGlobalSearchStore.setState({ include: '*.ts' })
    useGlobalSearchStore.getState().setQuery('needle')
    vi.advanceTimersByTime(300)
    expect(useGlobalSearchStore.getState().groups).toEqual([])
  })

  it('falls back to on-disk results for dirty tabs when the in-memory regex is invalid', () => {
    useEditorStore.setState({
      tabs: [{ path: '/proj/dirty.ts', content: 'x', dirty: true }] as any,
    })
    useGlobalSearchStore.setState({ regex: true })
    useGlobalSearchStore.getState().setQuery('(?P<n>x)') // valid Rust, invalid JS
    vi.advanceTimersByTime(300)
    expect(lastStart().options.skipPaths).toEqual([])
    expect(useGlobalSearchStore.getState().error).toBeNull()
  })
})

describe('globalSearchStore — results survive opening files (the point of the panel)', () => {
  function searchWithTwoFiles() {
    useGlobalSearchStore.getState().setQuery('needle')
    vi.advanceTimersByTime(300)
    const id = lastStart().id
    deliver(id, [hit('/proj/a.ts', 1), hit('/proj/b.ts', 2)])
    finish(id)
  }

  it('opening a hit reveals it in the editor without touching the result list', async () => {
    searchWithTwoFiles()
    api.readFile.mockResolvedValue('const needle = 1')
    const before = useGlobalSearchStore.getState().groups

    await useGlobalSearchStore.getState().openHit(hit('/proj/a.ts', 1))

    expect(useGlobalSearchStore.getState().groups).toBe(before)
    expect(useGlobalSearchStore.getState().status).toBe('done')
    expect(useGlobalSearchStore.getState().activeKey).toBe(hitKey(hit('/proj/a.ts', 1)))
    expect(useEditorStore.getState().revealRequest).toMatchObject({ path: '/proj/a.ts', line: 1, col: 7, searchTerm: 'needle' })
  })

  it('uses the matched text (not the raw query) as the highlight term, so regex hits highlight correctly', async () => {
    useGlobalSearchStore.setState({ regex: true })
    useGlobalSearchStore.getState().setQuery('need\\w+')
    vi.advanceTimersByTime(300)
    api.readFile.mockResolvedValue('needle')
    await useGlobalSearchStore.getState().openHit({ path: '/proj/a.ts', line: 1, col: 1, length: 6, text: 'needle', matchStart: 0 })
    expect(useEditorStore.getState().revealRequest?.searchTerm).toBe('needle')
  })

  it('marks a file stale when its open tab is edited afterwards, and only that file', () => {
    searchWithTwoFiles()
    useEditorStore.setState({
      tabs: [
        { path: '/proj/a.ts', content: 'const needle = 1', dirty: false },
        { path: '/proj/b.ts', content: 'const needle = 1', dirty: false },
      ] as any,
    })
    useEditorStore.setState({
      tabs: [
        { path: '/proj/a.ts', content: 'const needle = 1 // edited', dirty: true },
        { path: '/proj/b.ts', content: 'const needle = 1', dirty: false },
      ] as any,
    })
    const stale = Object.fromEntries(useGlobalSearchStore.getState().groups.map((g) => [g.path, g.stale]))
    expect(stale).toEqual({ '/proj/a.ts': true, '/proj/b.ts': false })
  })

  it('does not mark a file stale just for being saved (content unchanged)', () => {
    searchWithTwoFiles()
    useEditorStore.setState({ tabs: [{ path: '/proj/a.ts', content: 'same', dirty: true }] as any })
    useGlobalSearchStore.getState().refresh() // resets staleness baseline
    const id = lastStart().id
    deliver(id, [hit('/proj/a.ts', 1)])
    useEditorStore.setState({ tabs: [{ path: '/proj/a.ts', content: 'same', dirty: false }] as any })
    expect(useGlobalSearchStore.getState().groups[0].stale).toBe(false)
  })

  it('flags "changed on disk" only once results exist, and refresh clears every marker', () => {
    listeners.fs?.(ROOT) // nothing searched yet: ignored
    expect(useGlobalSearchStore.getState().diskChanged).toBe(false)

    searchWithTwoFiles()
    listeners.fs!(ROOT)
    expect(useGlobalSearchStore.getState().diskChanged).toBe(true)

    useGlobalSearchStore.setState({
      groups: useGlobalSearchStore.getState().groups.map((g) => ({ ...g, stale: true })),
    })
    useGlobalSearchStore.getState().refresh()
    const s = useGlobalSearchStore.getState()
    expect(s.diskChanged).toBe(false)
    expect(s.status).toBe('searching')
    expect(s.groups.every((g) => !g.stale)).toBe(true)
    expect(lastStart().options.query).toBe('needle')
  })

  it('clears results when the project changes', () => {
    searchWithTwoFiles()
    useFileStore.setState({ projectRoot: '/other' })
    expect(useGlobalSearchStore.getState().groups).toEqual([])
    expect(useGlobalSearchStore.getState().status).toBe('idle')
  })
})

describe('globalSearchStore — navigation', () => {
  function seed() {
    useGlobalSearchStore.getState().setQuery('needle')
    vi.advanceTimersByTime(300)
    deliver(lastStart().id, [hit('/proj/a.ts', 1), hit('/proj/a.ts', 5), hit('/proj/b.ts', 2)])
  }

  it('steps through hits across files in display order and stops at the ends', () => {
    seed()
    const s = () => useGlobalSearchStore.getState()
    expect(s().moveActive(1)).toMatchObject({ path: '/proj/a.ts', line: 1 })
    expect(s().moveActive(1)).toMatchObject({ path: '/proj/a.ts', line: 5 })
    expect(s().moveActive(1)).toMatchObject({ path: '/proj/b.ts', line: 2 })
    expect(s().moveActive(1)).toMatchObject({ path: '/proj/b.ts', line: 2 })
    expect(s().moveActive(-1)).toMatchObject({ path: '/proj/a.ts', line: 5 })
  })

  it('skips hits inside collapsed files', () => {
    seed()
    const s = () => useGlobalSearchStore.getState()
    s().toggleCollapsed('/proj/a.ts')
    expect(s().moveActive(1)).toMatchObject({ path: '/proj/b.ts', line: 2 })
  })
})
