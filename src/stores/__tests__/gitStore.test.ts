import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useGitStore, useRepoGitState, emptyRepoGitState } from '../gitStore'
import { GIT_LOG_TAB_PATH } from '@/components/Settings/paths'

// useRepoGitState is a React hook (it calls the useGitStore hook internally),
// so it can't be invoked as a bare function outside a component render — doing
// so hits React's "invalid hook call" path. This suite otherwise runs in the
// plain `node` vitest environment (see vitest.config.ts) and stubs `window`
// wholesale via vi.stubGlobal, which is incompatible with a real DOM render
// (jsdom + @testing-library/react's renderHook). A synchronous SSR render via
// react-dom/server needs neither `window` nor `document` and correctly drives
// zustand's useSyncExternalStore server-snapshot path, so it's used here just
// to invoke the hook under test.
function callHook<T>(hook: () => T): T {
  let captured!: T
  function Probe() {
    captured = hook()
    return null
  }
  renderToStaticMarkup(createElement(Probe))
  return captured
}
import type { GitStatus, GitAheadBehind } from '@/types/index'

const editorStoreMock = vi.hoisted(() => ({
  tabs: [] as Array<{ path: string; content: string; dirty: boolean }>,
  openTab: vi.fn(),
}))
const gitGraphLoadMock = vi.hoisted(() => vi.fn())
const gitBranchLoadMock = vi.hoisted(() => vi.fn())
const gitLogAppendMock = vi.hoisted(() => vi.fn())
const gitSettingsStoreMock = vi.hoisted(() => ({ gitLogAutoShow: 'always' as 'always' | 'onError' }))

vi.mock('@/stores/editorStore', () => ({
  useEditorStore: {
    getState: () => ({
      tabs: editorStoreMock.tabs,
      openTab: editorStoreMock.openTab,
    }),
  },
}))
vi.mock('@/stores/gitLogStore', () => ({
  useGitLogStore: { getState: () => ({ append: gitLogAppendMock }) },
}))
vi.mock('@/stores/gitGraphStore', () => ({
  useGitGraphStore: { getState: () => ({ load: gitGraphLoadMock }) },
}))
vi.mock('@/stores/gitBranchStore', () => ({
  useGitBranchStore: { getState: () => ({ load: gitBranchLoadMock }) },
}))
vi.mock('@/stores/gitSettingsStore', () => ({
  useGitSettingsStore: { getState: () => gitSettingsStoreMock },
}))

const emptyStatus: GitStatus = { staged: [], unstaged: [] }
const mockStatus: GitStatus = {
  staged: [{ path: 'a.ts', status: 'M' }],
  unstaged: [{ path: 'b.ts', status: '?' }],
}
const mockAheadBehind: GitAheadBehind = { ahead: 2, behind: 1 }

vi.stubGlobal('window', {
  api: {
    gitBranch: vi.fn().mockResolvedValue('main'),
    gitAheadBehind: vi.fn().mockResolvedValue(mockAheadBehind),
    gitStatus: vi.fn().mockResolvedValue(mockStatus),
    gitListIgnored: vi.fn().mockResolvedValue(['node_modules', 'dist']),
    gitStage: vi.fn().mockResolvedValue(undefined),
    gitUnstage: vi.fn().mockResolvedValue(undefined),
    gitStageAll: vi.fn().mockResolvedValue(undefined),
    gitUnstageAll: vi.fn().mockResolvedValue(undefined),
    gitDiscard: vi.fn().mockResolvedValue(undefined),
    gitDiscardAll: vi.fn().mockResolvedValue(undefined),
    gitCommit: vi.fn().mockResolvedValue({ ok: true }),
    gitRunCommand: vi.fn().mockResolvedValue(undefined),
    onGitLogData: vi.fn().mockReturnValue(() => {}),
    onGitLogExit: vi.fn().mockReturnValue(() => {}),
    gitFetchSilent: vi.fn().mockResolvedValue(true),
  },
})

describe('gitStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    editorStoreMock.tabs = []
    useGitStore.setState({ repos: {} })
  })

  it('starts with no repos and useRepoGitState falls back to defaults', () => {
    expect(useGitStore.getState().repos).toEqual({})
    expect(callHook(() => useRepoGitState('/proj'))).toEqual(emptyRepoGitState)
    expect(callHook(() => useRepoGitState(null))).toEqual(emptyRepoGitState)
  })

  it('refresh loads branch, ahead/behind counts, and status into repos[cwd]', async () => {
    await useGitStore.getState().refresh('/proj')
    const state = useGitStore.getState().repos['/proj']
    expect(state.branch).toBe('main')
    expect(state.aheadBehind).toEqual(mockAheadBehind)
    expect(state.status).toEqual(mockStatus)
  })

  it('refresh with null cwd is a no-op', async () => {
    await useGitStore.getState().refresh(null)
    expect(useGitStore.getState().repos).toEqual({})
    expect(window.api.gitBranch).not.toHaveBeenCalled()
  })

  it('refreshStatus loads ignored paths alongside status', async () => {
    await useGitStore.getState().refreshStatus('/proj')
    expect(window.api.gitListIgnored).toHaveBeenCalledWith('/proj')
    expect(useGitStore.getState().repos['/proj'].ignoredPaths).toEqual(['node_modules', 'dist'])
  })

  it('refreshStatus with null cwd is a no-op', async () => {
    await useGitStore.getState().refreshStatus(null)
    expect(useGitStore.getState().repos).toEqual({})
  })

  it('stage calls gitStage with the path and refreshes status for that repo', async () => {
    await useGitStore.getState().stage('/proj', 'a.ts')
    expect(window.api.gitStage).toHaveBeenCalledWith('/proj', ['a.ts'])
    expect(useGitStore.getState().repos['/proj'].status).toEqual(mockStatus)
  })

  it('unstage calls gitUnstage with the path', async () => {
    await useGitStore.getState().unstage('/proj', 'b.ts')
    expect(window.api.gitUnstage).toHaveBeenCalledWith('/proj', ['b.ts'])
  })

  it('discardAll does not throw and still refreshes status when gitDiscardAll rejects', async () => {
    vi.mocked(window.api.gitDiscardAll).mockRejectedValueOnce(new Error('boom'))
    await expect(useGitStore.getState().discardAll('/proj')).resolves.toBeUndefined()
    expect(window.api.gitStatus).toHaveBeenCalledWith('/proj')
    expect(useGitStore.getState().repos['/proj'].status).toEqual(mockStatus)
  })

  it('two repos keep fully independent state', async () => {
    await useGitStore.getState().refresh('/repoA')
    vi.mocked(window.api.gitBranch).mockResolvedValueOnce('feature-x')
    vi.mocked(window.api.gitStatus).mockResolvedValueOnce(emptyStatus)
    await useGitStore.getState().refresh('/repoB')

    expect(useGitStore.getState().repos['/repoA'].branch).toBe('main')
    expect(useGitStore.getState().repos['/repoB'].branch).toBe('feature-x')
  })

  it('setCommitMessage updates the message for the given repo and clears its error', () => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, commitError: 'boom' } } })
    useGitStore.getState().setCommitMessage('/proj', 'fix bug')
    const state = useGitStore.getState().repos['/proj']
    expect(state.commitMessage).toBe('fix bug')
    expect(state.commitError).toBeNull()
  })

  it('setCommitMessage does not affect other repos', () => {
    useGitStore.setState({
      repos: {
        '/repoA': { ...emptyRepoGitState, commitMessage: 'a' },
        '/repoB': { ...emptyRepoGitState, commitMessage: 'b' },
      },
    })
    useGitStore.getState().setCommitMessage('/repoA', 'updated')
    expect(useGitStore.getState().repos['/repoA'].commitMessage).toBe('updated')
    expect(useGitStore.getState().repos['/repoB'].commitMessage).toBe('b')
  })

  it('commit clears the message and refreshes on success', async () => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, commitMessage: 'fix bug' } } })
    await useGitStore.getState().commit('/proj')
    expect(window.api.gitCommit).toHaveBeenCalledWith('/proj', 'fix bug', undefined)
    const state = useGitStore.getState().repos['/proj']
    expect(state.commitMessage).toBe('')
    expect(state.commitError).toBeNull()
  })

  it('commit passes noVerify through to gitCommit as a one-shot flag', async () => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, commitMessage: 'fix bug' } } })
    await useGitStore.getState().commit('/proj', true)
    expect(window.api.gitCommit).toHaveBeenCalledWith('/proj', 'fix bug', true)
  })

  it('commit sets commitError and keeps the message on failure', async () => {
    vi.mocked(window.api.gitCommit).mockResolvedValueOnce({ ok: false, error: 'nothing staged' })
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, commitMessage: 'fix bug' } } })
    await useGitStore.getState().commit('/proj')
    const state = useGitStore.getState().repos['/proj']
    expect(state.commitMessage).toBe('fix bug')
    expect(state.commitError).toBe('nothing staged')
  })

  it('commit sets commandStatus to running while in flight, back to idle after', async () => {
    let resolveCommit: (v: { ok: true }) => void = () => {}
    vi.mocked(window.api.gitCommit).mockReturnValueOnce(
      new Promise((resolve) => { resolveCommit = resolve })
    )
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, commitMessage: 'fix bug' } } })
    const commitPromise = useGitStore.getState().commit('/proj')
    expect(useGitStore.getState().repos['/proj'].commandStatus).toBe('running')
    resolveCommit({ ok: true })
    await commitPromise
    expect(useGitStore.getState().repos['/proj'].commandStatus).toBe('idle')
  })

  it('commit increments commandError on failure, same as any other git command', async () => {
    vi.mocked(window.api.gitCommit).mockResolvedValueOnce({ ok: false, error: 'nothing staged' })
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, commitMessage: 'fix bug' } } })
    await useGitStore.getState().commit('/proj')
    expect(useGitStore.getState().repos['/proj'].commandError).toBe(1)
  })

  it('commit does not increment commandError on success', async () => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, commitMessage: 'fix bug' } } })
    await useGitStore.getState().commit('/proj')
    expect(useGitStore.getState().repos['/proj'].commandError).toBe(0)
  })
})

describe('gitStore — command actions', () => {
  beforeEach(() => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, branch: 'main' } } })
    vi.mocked(window.api.gitRunCommand).mockClear()
    gitBranchLoadMock.mockClear()
    vi.mocked(window.api.onGitLogData).mockClear()
    vi.mocked(window.api.onGitLogExit).mockClear()
    vi.mocked(window.api.gitBranch).mockClear()
    vi.mocked(window.api.gitFetchSilent).mockClear()
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('test-uuid' as `${string}-${string}-${string}-${string}-${string}`)
  })

  it('sets commandStatus to running for that repo and calls gitRunCommand for push', async () => {
    const pushPromise = useGitStore.getState().push('/proj')
    expect(useGitStore.getState().repos['/proj'].commandStatus).toBe('running')
    expect(window.api.gitRunCommand).toHaveBeenCalledWith(expect.any(String), '/proj', 'push')
    await pushPromise
  })

  it('does nothing if that repo already has a command running', async () => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, commandStatus: 'running' } } })
    await useGitStore.getState().push('/proj')
    expect(window.api.gitRunCommand).not.toHaveBeenCalled()
  })

  it('a running command in one repo does not block another repo', async () => {
    useGitStore.setState({
      repos: {
        '/repoA': { ...emptyRepoGitState, commandStatus: 'running' },
        '/repoB': { ...emptyRepoGitState },
      },
    })
    await useGitStore.getState().push('/repoB')
    expect(window.api.gitRunCommand).toHaveBeenCalledWith(expect.any(String), '/repoB', 'push')
  })

  it('sets commandStatus back to idle for that repo on exit code 0 and refreshes', async () => {
    let exitCb: ((id: string, code: number) => void) | null = null
    vi.mocked(window.api.onGitLogExit).mockImplementation((cb) => {
      exitCb = cb
      return () => {}
    })
    const pushPromise = useGitStore.getState().push('/proj')
    await pushPromise
    exitCb!('test-uuid', 0)
    expect(useGitStore.getState().repos['/proj'].commandStatus).toBe('idle')
    expect(window.api.gitBranch).toHaveBeenCalledWith('/proj')
  })

  it('checkout reloads the branch list for that repo on successful exit', async () => {
    let exitCb: ((id: string, code: number) => void) | null = null
    vi.mocked(window.api.onGitLogExit).mockImplementation((cb) => {
      exitCb = cb
      return () => {}
    })
    const checkoutPromise = useGitStore.getState().checkout('/proj', { ref: 'feature-x', create: false })
    await checkoutPromise
    exitCb!('test-uuid', 0)
    expect(gitBranchLoadMock).toHaveBeenCalledWith('/proj')
  })

  it('does not increment commandError for that repo on a successful exit', async () => {
    let exitCb: ((id: string, code: number) => void) | null = null
    vi.mocked(window.api.onGitLogExit).mockImplementation((cb) => {
      exitCb = cb
      return () => {}
    })
    const pushPromise = useGitStore.getState().push('/proj')
    await pushPromise
    exitCb!('test-uuid', 0)
    expect(useGitStore.getState().repos['/proj'].commandError).toBe(0)
  })

  it('increments commandError for that repo on a non-zero exit code', async () => {
    let exitCb: ((id: string, code: number) => void) | null = null
    vi.mocked(window.api.onGitLogExit).mockImplementation((cb) => {
      exitCb = cb
      return () => {}
    })
    const pushPromise = useGitStore.getState().push('/proj')
    await pushPromise
    exitCb!('test-uuid', 1)
    expect(useGitStore.getState().repos['/proj'].commandError).toBe(1)
  })

  it('increments commandError again on a second failing command', async () => {
    let exitCb: ((id: string, code: number) => void) | null = null
    vi.mocked(window.api.onGitLogExit).mockImplementation((cb) => {
      exitCb = cb
      return () => {}
    })
    const firstPush = useGitStore.getState().push('/proj')
    await firstPush
    exitCb!('test-uuid', 1)

    const secondPush = useGitStore.getState().push('/proj')
    await secondPush
    exitCb!('test-uuid', 1)

    expect(useGitStore.getState().repos['/proj'].commandError).toBe(2)
  })

  it('increments commandError if gitRunCommand itself throws', async () => {
    vi.mocked(window.api.gitRunCommand).mockRejectedValueOnce(new Error('spawn failed'))
    await useGitStore.getState().push('/proj')
    expect(useGitStore.getState().repos['/proj'].commandError).toBe(1)
  })

  it('undoLastCommit calls gitRunCommand with no payload', async () => {
    await useGitStore.getState().undoLastCommit('/proj')
    expect(window.api.gitRunCommand).toHaveBeenCalledWith(expect.any(String), '/proj', 'undoLastCommit')
  })

  it('hardReset calls gitRunCommand with the chosen ref as payload', async () => {
    await useGitStore.getState().hardReset('/proj', 'origin/main')
    expect(window.api.gitRunCommand).toHaveBeenCalledWith(
      expect.any(String), '/proj', 'hardReset', { ref: 'origin/main' }
    )
  })
})

describe('gitStore — Git Log auto-show setting', () => {
  beforeEach(() => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, branch: 'main' } } })
    editorStoreMock.openTab.mockClear()
    vi.mocked(window.api.onGitLogExit).mockClear()
    vi.mocked(window.api.gitRunCommand).mockClear()
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('test-uuid' as `${string}-${string}-${string}-${string}-${string}`)
  })

  afterEach(() => {
    gitSettingsStoreMock.gitLogAutoShow = 'always'
  })

  it('"always" opens the Git Log tab immediately, before the command finishes', async () => {
    gitSettingsStoreMock.gitLogAutoShow = 'always'
    const pushPromise = useGitStore.getState().push('/proj')
    expect(editorStoreMock.openTab).toHaveBeenCalledWith({ path: GIT_LOG_TAB_PATH, content: '', dirty: false })
    await pushPromise
  })

  it('"onError" does not open the tab up front, and stays closed on a successful exit', async () => {
    gitSettingsStoreMock.gitLogAutoShow = 'onError'
    let exitCb: ((id: string, code: number) => void) | null = null
    vi.mocked(window.api.onGitLogExit).mockImplementation((cb) => {
      exitCb = cb
      return () => {}
    })
    const pushPromise = useGitStore.getState().push('/proj')
    expect(editorStoreMock.openTab).not.toHaveBeenCalled()
    await pushPromise
    exitCb!('test-uuid', 0)
    expect(editorStoreMock.openTab).not.toHaveBeenCalled()
  })

  it('"onError" opens the tab once the command exits with a non-zero code', async () => {
    gitSettingsStoreMock.gitLogAutoShow = 'onError'
    let exitCb: ((id: string, code: number) => void) | null = null
    vi.mocked(window.api.onGitLogExit).mockImplementation((cb) => {
      exitCb = cb
      return () => {}
    })
    const pushPromise = useGitStore.getState().push('/proj')
    await pushPromise
    exitCb!('test-uuid', 1)
    expect(editorStoreMock.openTab).toHaveBeenCalledWith({ path: GIT_LOG_TAB_PATH, content: '', dirty: false })
  })

  it('"onError" opens the tab if gitRunCommand itself throws', async () => {
    gitSettingsStoreMock.gitLogAutoShow = 'onError'
    vi.mocked(window.api.gitRunCommand).mockRejectedValueOnce(new Error('spawn failed'))
    await useGitStore.getState().push('/proj')
    expect(editorStoreMock.openTab).toHaveBeenCalledWith({ path: GIT_LOG_TAB_PATH, content: '', dirty: false })
  })
})

describe('gitStore — fetchSilent', () => {
  beforeEach(() => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, branch: 'main' } } })
    vi.mocked(window.api.gitFetchSilent).mockClear().mockResolvedValue(true)
    vi.mocked(window.api.gitBranch).mockClear()
  })

  it('sets silentFetchInFlight for that repo while running and clears it after', async () => {
    let resolveFetch: (v: boolean) => void = () => {}
    vi.mocked(window.api.gitFetchSilent).mockReturnValueOnce(
      new Promise((resolve) => { resolveFetch = resolve })
    )
    const fetchPromise = useGitStore.getState().fetchSilent('/proj')
    expect(useGitStore.getState().repos['/proj'].silentFetchInFlight).toBe(true)
    resolveFetch(true)
    await fetchPromise
    expect(useGitStore.getState().repos['/proj'].silentFetchInFlight).toBe(false)
  })

  it('does nothing if a silent fetch is already in flight for that repo', async () => {
    useGitStore.setState({ repos: { '/proj': { ...emptyRepoGitState, silentFetchInFlight: true } } })
    await useGitStore.getState().fetchSilent('/proj')
    expect(window.api.gitFetchSilent).not.toHaveBeenCalled()
  })
})
