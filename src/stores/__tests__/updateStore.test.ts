import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useUpdateStore } from '../updateStore'
import { PENDING_CHANGELOG_KEY } from '../changelogStore'

const { openTabMock, pendingTerminalCommands, localStorageStore } = vi.hoisted(() => {
  const localStorageStore: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
  }
  return {
    openTabMock: vi.fn(),
    pendingTerminalCommands: new Map<string, string>(),
    localStorageStore,
  }
})

vi.mock('@/stores/editorStore', () => ({
  useEditorStore: { getState: () => ({ openTab: openTabMock }) },
}))

vi.mock('@/components/Terminal/TerminalTab', () => ({ pendingTerminalCommands }))

let termDataHandler: ((id: string, data: string) => void) | null = null

vi.stubGlobal('window', {
  api: {
    onTermData: vi.fn((cb: (id: string, data: string) => void) => {
      termDataHandler = cb
      return () => { termDataHandler = null }
    }),
    updateRestart: vi.fn(),
  },
})

describe('updateStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pendingTerminalCommands.clear()
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    termDataHandler = null
    useUpdateStore.setState({ available: null, status: 'idle' })
  })

  it('starts with no update available and idle status', () => {
    const { available, status } = useUpdateStore.getState()
    expect(available).toBeNull()
    expect(status).toBe('idle')
  })

  it('setAvailable stores the update info', () => {
    useUpdateStore.getState().setAvailable({ version: '0.2.0', url: 'https://example.com' })
    expect(useUpdateStore.getState().available).toEqual({ version: '0.2.0', url: 'https://example.com' })
  })

  it('startUpdate opens a terminal tab with the install command queued and sets status to updating', () => {
    useUpdateStore.getState().startUpdate()
    expect(useUpdateStore.getState().status).toBe('updating')
    expect(openTabMock).toHaveBeenCalledTimes(1)
    const [[{ path }]] = openTabMock.mock.calls
    expect(path).toMatch(/^terminal:\/\//)
    const id = path.replace('terminal://', '')
    expect(pendingTerminalCommands.get(id)).toContain('install.sh')
  })

  it('does nothing if an update is already in progress', () => {
    useUpdateStore.getState().startUpdate()
    openTabMock.mockClear()
    useUpdateStore.getState().startUpdate()
    expect(openTabMock).not.toHaveBeenCalled()
  })

  it('flips to ready when the terminal reports a zero exit sentinel', () => {
    useUpdateStore.getState().startUpdate()
    const [[{ path }]] = openTabMock.mock.calls
    const id = path.replace('terminal://', '')
    termDataHandler!(id, '__VIDE_UPDATE_EXIT_0__')
    expect(useUpdateStore.getState().status).toBe('ready')
  })

  it('flips to failed when the terminal reports a non-zero exit sentinel', () => {
    useUpdateStore.getState().startUpdate()
    const [[{ path }]] = openTabMock.mock.calls
    const id = path.replace('terminal://', '')
    termDataHandler!(id, '__VIDE_UPDATE_EXIT_1__')
    expect(useUpdateStore.getState().status).toBe('failed')
  })

  it('ignores terminal output from unrelated terminals', () => {
    useUpdateStore.getState().startUpdate()
    termDataHandler!('some-other-terminal', '__VIDE_UPDATE_EXIT_0__')
    expect(useUpdateStore.getState().status).toBe('updating')
  })

  it('restart calls window.api.updateRestart', () => {
    useUpdateStore.getState().restart()
    expect(window.api.updateRestart).toHaveBeenCalled()
  })

  it('restart stashes the available version for the changelog modal to pick up after relaunch', () => {
    useUpdateStore.getState().setAvailable({ version: '0.2.0', url: 'https://example.com' })
    useUpdateStore.getState().restart()
    expect(localStorage.getItem(PENDING_CHANGELOG_KEY)).toBe('0.2.0')
  })

  it('restart does not stash a version when none is available', () => {
    useUpdateStore.getState().restart()
    expect(localStorage.getItem(PENDING_CHANGELOG_KEY)).toBeNull()
  })
})
