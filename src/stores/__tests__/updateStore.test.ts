import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useUpdateStore } from '../updateStore'
import { PENDING_CHANGELOG_KEY, UPDATED_FROM_KEY } from '../changelogStore'
import { UPDATE_TAB_PATH } from '@/components/Settings/paths'

const { openTabMock, localStorageStore } = vi.hoisted(() => {
  const localStorageStore: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
  }
  return { openTabMock: vi.fn(), localStorageStore }
})

vi.mock('@/stores/editorStore', () => ({
  useEditorStore: { getState: () => ({ openTab: openTabMock }) },
}))

let outputHandler: ((out: { line: string; stream: 'stdout' | 'stderr' }) => void) | null = null
let exitHandler: ((code: number) => void) | null = null

const api = {
  updateRun: vi.fn(() => Promise.resolve()),
  updateGetRemoteChangelog: vi.fn((_v: string) => Promise.resolve('## v0.2.0 (2026-10-08)\n- **Alarms**: new' as string | null)),
  onUpdateOutput: vi.fn((cb: typeof outputHandler) => {
    outputHandler = cb
    return () => { outputHandler = null }
  }),
  onUpdateExit: vi.fn((cb: typeof exitHandler) => {
    exitHandler = cb
    return () => { exitHandler = null }
  }),
  updateRestart: vi.fn(),
  updateGetStatus: vi.fn(() => Promise.resolve({ latest: null, lastCheckedAt: 1_000, failed: false })),
  updateCheck: vi.fn(() => Promise.resolve({ latest: { version: '0.3.0', url: 'u' } as { version: string; url: string } | null, lastCheckedAt: 2_000, failed: false })),
}
vi.stubGlobal('window', { api })

const out = (line: string, stream: 'stdout' | 'stderr' = 'stdout') => outputHandler!({ line, stream })
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('updateStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    outputHandler = null
    exitHandler = null
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com', severity: 'normal' }, snoozedVersion: null, status: 'idle', stage: null, failure: null, log: [], changelog: undefined })
  })

  it('starts with no update available and idle status', () => {
    useUpdateStore.setState({ available: null })
    expect(useUpdateStore.getState()).toMatchObject({ available: null, status: 'idle' })
  })

  it('openUpdatePage opens the Update tab and loads what\'s new without starting the update', async () => {
    useUpdateStore.getState().openUpdatePage()
    expect(openTabMock).toHaveBeenCalledWith(expect.objectContaining({ path: UPDATE_TAB_PATH }))
    expect(api.updateRun).not.toHaveBeenCalled()
    expect(api.updateGetRemoteChangelog).toHaveBeenCalledWith('0.2.0')
    await flush()
    // the "## v0.2.0 (date)" heading is dropped — the page has its own title
    expect(useUpdateStore.getState().changelog).toBe('- **Alarms**: new')
  })

  it('records null when what\'s new can\'t be fetched', async () => {
    api.updateGetRemoteChangelog.mockResolvedValueOnce(null)
    useUpdateStore.getState().openUpdatePage()
    await flush()
    expect(useUpdateStore.getState().changelog).toBeNull()
  })

  it('startUpdate opens the page, runs the update in the background, and starts at Download', () => {
    useUpdateStore.getState().startUpdate()
    expect(openTabMock).toHaveBeenCalledWith(expect.objectContaining({ path: UPDATE_TAB_PATH }))
    expect(api.updateRun).toHaveBeenCalledTimes(1)
    expect(useUpdateStore.getState()).toMatchObject({ status: 'updating', stage: 'download' })
  })

  it('does nothing if an update is already in progress', () => {
    useUpdateStore.getState().startUpdate()
    useUpdateStore.getState().startUpdate()
    expect(api.updateRun).toHaveBeenCalledTimes(1)
  })

  it('follows the install script\'s messages through the stages and keeps the log', () => {
    useUpdateStore.getState().startUpdate()
    out('Downloading vIDE...')
    out('Installing to /Applications...')
    expect(useUpdateStore.getState().stage).toBe('install')
    out('Administrator rights are required to update vIDE in /Applications.')
    expect(useUpdateStore.getState().stage).toBe('password')
    out('some unrelated line')
    expect(useUpdateStore.getState().stage).toBe('password')
    expect(useUpdateStore.getState().log.map((l) => l.line)).toHaveLength(4)
  })

  it('flips to ready on a zero exit', () => {
    useUpdateStore.getState().startUpdate()
    out('vIDE installed.')
    exitHandler!(0)
    expect(useUpdateStore.getState()).toMatchObject({ status: 'ready', stage: null })
  })

  it('flips to failed on a non-zero exit, with the reason read from the log', () => {
    useUpdateStore.getState().startUpdate()
    out('Administrator rights are required to update vIDE in /Applications.')
    out('Update cancelled: administrator rights are required.', 'stderr')
    exitHandler!(1)
    expect(useUpdateStore.getState()).toMatchObject({ status: 'failed', failure: 'admin-declined' })
  })

  it('stops listening once the update finishes', () => {
    useUpdateStore.getState().startUpdate()
    exitHandler!(0)
    expect(outputHandler).toBeNull()
    expect(exitHandler).toBeNull()
  })

  it('Try again starts a fresh run with an empty log', () => {
    useUpdateStore.getState().startUpdate()
    out('Downloading vIDE...')
    exitHandler!(1)
    useUpdateStore.getState().startUpdate()
    expect(useUpdateStore.getState()).toMatchObject({ status: 'updating', stage: 'download', failure: null, log: [] })
  })

  it('fails if the update could not be started at all', async () => {
    api.updateRun.mockRejectedValueOnce(new Error('ipc gone'))
    useUpdateStore.getState().startUpdate()
    await flush()
    expect(useUpdateStore.getState().status).toBe('failed')
    expect(useUpdateStore.getState().log.at(-1)?.line).toMatch(/ipc gone/)
  })

  it('restart records the new version and the one it replaces, then relaunches', () => {
    vi.stubGlobal('__APP_VERSION__', '0.1.9')
    try {
      useUpdateStore.getState().restart()
      expect(localStorage.getItem(PENDING_CHANGELOG_KEY)).toBe('0.2.0')
      expect(localStorage.getItem(UPDATED_FROM_KEY)).toBe('0.1.9')
      expect(api.updateRestart).toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
      vi.stubGlobal('window', { api })
    }
  })

  it('restart does not stash a version when none is available', () => {
    useUpdateStore.setState({ available: null })
    useUpdateStore.getState().restart()
    expect(localStorage.getItem(PENDING_CHANGELOG_KEY)).toBeNull()
  })

  it('checkForUpdates shows checking, then records what it found', async () => {
    const pending = useUpdateStore.getState().checkForUpdates()
    expect(useUpdateStore.getState().checking).toBe(true)
    await pending
    expect(useUpdateStore.getState()).toMatchObject({ checking: false, available: { version: '0.3.0' }, lastCheckedAt: 2_000, checkFailed: false })
  })

  it('checkForUpdates records a failed check', async () => {
    api.updateCheck.mockResolvedValueOnce({ latest: null, lastCheckedAt: 1_000, failed: true })
    await useUpdateStore.getState().checkForUpdates()
    expect(useUpdateStore.getState()).toMatchObject({ checking: false, checkFailed: true, lastCheckedAt: 1_000 })
  })

  it('loadCheckStatus picks up when the background checker last ran', async () => {
    useUpdateStore.getState().loadCheckStatus()
    await flush()
    expect(useUpdateStore.getState().lastCheckedAt).toBe(1_000)
  })
})

