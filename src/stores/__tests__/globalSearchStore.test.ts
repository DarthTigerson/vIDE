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
    writeFile: vi.fn(),
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
    replacement: '', replacing: false, pendingReplaceAll: null, replaceOutcome: null,
  })
  useFileStore.setState({ projectRoot: ROOT })
  useEditorStore.setState({ tabs: [], revealRequest: null })
}

beforeEach(() => {
  vi.useFakeTimers()
  api.searchStart.mockClear()
  api.searchCancel.mockClear()
  api.readFile.mockReset()
  api.writeFile.mockReset()
  api.writeFile.mockResolvedValue(undefined)
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

describe('globalSearchStore — replace', () => {
  const A = '/proj/a.ts'
  const B = '/proj/b.ts'

  function seed(groups: Array<{ path: string; hits: SearchHit[] }>, extra: Record<string, unknown> = {}) {
    useGlobalSearchStore.setState({
      query: 'needle',
      replacement: 'pin',
      status: 'done',
      groups: groups.map((g) => ({ ...g, stale: false })),
      matchCount: groups.reduce((n, g) => n + g.hits.length, 0),
      searchId: 's-seed',
      root: ROOT,
      ...extra,
    })
    api.searchStart.mockClear()
  }

  const getS = () => useGlobalSearchStore.getState()
  const tab = (path: string) => useEditorStore.getState().tabs.find((t) => t.path === path)

  it('replaces a hit inside an open tab in place, leaving it unsaved and never touching the disk', async () => {
    useEditorStore.setState({ tabs: [{ path: A, content: 'const needle = 1\n', dirty: false }] as any })
    seed([{ path: A, hits: [hit(A, 1)] }])

    await getS().replaceHit(hit(A, 1))

    expect(tab(A)).toMatchObject({ content: 'const pin = 1\n', dirty: true })
    expect(api.writeFile).not.toHaveBeenCalled()
    expect(api.readFile).not.toHaveBeenCalled()
    expect(getS().replaceOutcome?.message).toMatch(/replaced 1 match in 1 file/i)
  })

  it('reads, replaces and writes a file that is not open', async () => {
    api.readFile.mockResolvedValue('const needle = 1\nneedle\n')
    seed([{ path: A, hits: [hit(A, 1), hit(A, 2, 'needle', 1)] }])

    await getS().replaceFile(A)

    expect(api.writeFile).toHaveBeenCalledWith(A, 'const pin = 1\npin\n')
    expect(getS().replaceOutcome?.message).toMatch(/replaced 2 matches in 1 file/i)
  })

  it('replaceHit changes only that hit, not the rest of the file', async () => {
    api.readFile.mockResolvedValue('needle\nneedle\n')
    seed([{ path: A, hits: [hit(A, 1, 'needle', 1), hit(A, 2, 'needle', 1)] }])

    await getS().replaceHit(hit(A, 2, 'needle', 1))

    expect(api.writeFile).toHaveBeenCalledWith(A, 'needle\npin\n')
  })

  it('refreshes the search afterwards so the list reflects what is left', async () => {
    api.readFile.mockResolvedValue('needle\n')
    seed([{ path: A, hits: [hit(A, 1, 'needle', 1)] }])
    await getS().replaceFile(A)
    expect(api.searchStart).toHaveBeenCalledTimes(1)
    expect(getS().status).toBe('searching')
  })

  it('does nothing while a search is still running (results would be incomplete)', async () => {
    seed([{ path: A, hits: [hit(A, 1)] }], { status: 'searching' })
    await getS().replaceFile(A)
    expect(api.writeFile).not.toHaveBeenCalled()
    expect(getS().replaceOutcome).toBeNull()
  })

  it('skips hits whose file changed since the search, writes nothing for them, and says so', async () => {
    api.readFile.mockResolvedValue('totally different now\n')
    seed([{ path: A, hits: [hit(A, 1)] }])

    await getS().replaceFile(A)

    expect(api.writeFile).not.toHaveBeenCalled()
    expect(getS().replaceOutcome?.records).toEqual([])
    expect(getS().replaceOutcome?.message).toMatch(/changed since/i)
  })

  it('reports a partial result when only some hits still match', async () => {
    api.readFile.mockResolvedValue('needle\nchanged\n')
    seed([{ path: A, hits: [hit(A, 1, 'needle', 1), hit(A, 2, 'needle', 1)] }])
    await getS().replaceFile(A)
    expect(api.writeFile).toHaveBeenCalledWith(A, 'pin\nchanged\n')
    expect(getS().replaceOutcome?.message).toMatch(/replaced 1 match in 1 file.*1 no longer matched/i)
  })

  it('carries on past a file that cannot be read, and counts it', async () => {
    api.readFile.mockImplementation(async (path: string) => {
      if (path === A) throw new Error('EACCES')
      return 'needle\n'
    })
    seed([{ path: A, hits: [hit(A, 1, 'needle', 1)] }, { path: B, hits: [hit(B, 1, 'needle', 1)] }])
    getS().requestReplaceAll()
    await getS().confirmReplaceAll()
    expect(api.writeFile).toHaveBeenCalledTimes(1)
    expect(api.writeFile).toHaveBeenCalledWith(B, 'pin\n')
    expect(getS().replaceOutcome?.message).toMatch(/1 file.*could not be updated/i)
  })

  it('allows replacing with nothing', async () => {
    api.readFile.mockResolvedValue('a needle b\n')
    seed([{ path: A, hits: [hit(A, 1, 'a needle b', 3)] }], { replacement: '' })
    await getS().replaceFile(A)
    expect(api.writeFile).toHaveBeenCalledWith(A, 'a  b\n')
  })

  describe('replace all', () => {
    it('asks first, reporting how many matches in how many files, and writes nothing until confirmed', () => {
      seed([
        { path: A, hits: [hit(A, 1), hit(A, 2)] },
        { path: B, hits: [hit(B, 1)] },
      ])
      getS().requestReplaceAll()
      expect(getS().pendingReplaceAll).toEqual({ matches: 3, files: 2 })
      expect(api.writeFile).not.toHaveBeenCalled()
    })

    it('does not ask when there is nothing to replace', () => {
      seed([])
      getS().requestReplaceAll()
      expect(getS().pendingReplaceAll).toBeNull()
    })

    it('cancel drops the request without touching anything', () => {
      seed([{ path: A, hits: [hit(A, 1)] }])
      getS().requestReplaceAll()
      getS().cancelReplaceAll()
      expect(getS().pendingReplaceAll).toBeNull()
      expect(api.writeFile).not.toHaveBeenCalled()
    })

    it('confirm replaces in every file — tabs in place, the rest on disk', async () => {
      useEditorStore.setState({ tabs: [{ path: A, content: 'needle\n', dirty: false }] as any })
      api.readFile.mockResolvedValue('needle\n')
      seed([
        { path: A, hits: [hit(A, 1, 'needle', 1)] },
        { path: B, hits: [hit(B, 1, 'needle', 1)] },
      ])
      getS().requestReplaceAll()
      await getS().confirmReplaceAll()

      expect(tab(A)).toMatchObject({ content: 'pin\n', dirty: true })
      expect(api.writeFile).toHaveBeenCalledTimes(1)
      expect(api.writeFile).toHaveBeenCalledWith(B, 'pin\n')
      expect(getS().pendingReplaceAll).toBeNull()
      expect(getS().replaceOutcome?.message).toMatch(/replaced 2 matches in 2 files/i)
      expect(getS().replacing).toBe(false)
    })
  })

  describe('undo', () => {
    it('restores a file written to disk', async () => {
      api.readFile.mockResolvedValueOnce('needle\n')
      seed([{ path: A, hits: [hit(A, 1, 'needle', 1)] }])
      await getS().replaceFile(A)

      api.readFile.mockResolvedValueOnce('pin\n') // what is on disk now
      api.writeFile.mockClear()
      await getS().undoReplace()

      expect(api.writeFile).toHaveBeenCalledWith(A, 'needle\n')
      expect(getS().replaceOutcome).toBeNull()
    })

    it('leaves a disk file alone if it changed again since the replace, and says so', async () => {
      api.readFile.mockResolvedValueOnce('needle\n')
      seed([{ path: A, hits: [hit(A, 1, 'needle', 1)] }])
      await getS().replaceFile(A)

      api.readFile.mockResolvedValueOnce('pin\nsomeone edited me\n')
      api.writeFile.mockClear()
      await getS().undoReplace()

      expect(api.writeFile).not.toHaveBeenCalled()
      expect(getS().replaceOutcome?.message).toMatch(/changed since.*left alone/i)
    })

    it('restores an open tab, and returns it to clean if it was clean before', async () => {
      useEditorStore.setState({ tabs: [{ path: A, content: 'needle\n', dirty: false }] as any })
      seed([{ path: A, hits: [hit(A, 1, 'needle', 1)] }])
      await getS().replaceFile(A)
      expect(tab(A)).toMatchObject({ content: 'pin\n', dirty: true })

      await getS().undoReplace()
      expect(tab(A)).toMatchObject({ content: 'needle\n', dirty: false })
    })

    it('keeps a tab dirty on undo if it already had unsaved edits before the replace', async () => {
      useEditorStore.setState({ tabs: [{ path: A, content: 'needle unsaved\n', dirty: true }] as any })
      seed([{ path: A, hits: [hit(A, 1, 'needle unsaved', 1)] }])
      await getS().replaceFile(A)
      await getS().undoReplace()
      expect(tab(A)).toMatchObject({ content: 'needle unsaved\n', dirty: true })
    })

    it('does not clobber an open tab edited again after the replace', async () => {
      useEditorStore.setState({ tabs: [{ path: A, content: 'needle\n', dirty: false }] as any })
      seed([{ path: A, hits: [hit(A, 1, 'needle', 1)] }])
      await getS().replaceFile(A)
      useEditorStore.getState().updateContent(A, 'pin\nplus new typing\n')

      await getS().undoReplace()
      expect(tab(A)?.content).toBe('pin\nplus new typing\n')
      expect(getS().replaceOutcome?.message).toMatch(/left alone/i)
    })

    it('can be dismissed', async () => {
      api.readFile.mockResolvedValue('needle\n')
      seed([{ path: A, hits: [hit(A, 1, 'needle', 1)] }])
      await getS().replaceFile(A)
      getS().dismissReplaceOutcome()
      expect(getS().replaceOutcome).toBeNull()
    })
  })
})

