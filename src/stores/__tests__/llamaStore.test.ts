import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLlamaStore, _resetLlamaListenersForTesting } from '../llamaStore'

const { llamaIsAvailable, llamaGetLog, llamaStart, listeners } = vi.hoisted(() => ({
  llamaIsAvailable: vi.fn(),
  llamaGetLog: vi.fn(),
  llamaStart: vi.fn(),
  listeners: { data: [] as ((id: string, data: string) => void)[], exit: [] as ((id: string, code: number) => void)[] },
}))

vi.stubGlobal('window', {
  api: {
    llamaIsAvailable,
    llamaGetLog,
    llamaStart,
    onLlamaData: (cb: (id: string, data: string) => void) => { listeners.data.push(cb); return () => {} },
    onLlamaExit: (cb: (id: string, code: number) => void) => { listeners.exit.push(cb); return () => {} },
  },
})

const emitData = (id: string, data: string) => listeners.data.forEach((cb) => cb(id, data))
const emitExit = (id: string, code: number) => listeners.exit.forEach((cb) => cb(id, code))

describe('llamaStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useLlamaStore.setState({ available: null, checking: false, runs: {} })
    listeners.data.length = 0
    listeners.exit.length = 0
    _resetLlamaListenersForTesting()
  })

  it('attachModel loads the output kept by the main process and follows it', async () => {
    llamaGetLog.mockResolvedValue({ running: true, output: 'loading model\n' })
    await useLlamaStore.getState().attachModel('m1')
    expect(useLlamaStore.getState().runs.m1).toMatchObject({ running: true, output: 'loading model\n', logged: true })

    emitData('m1', 'listening\n')
    expect(useLlamaStore.getState().runs.m1.output).toBe('loading model\nlistening\n')
  })

  it('attachModel leaves the run alone when vIDE never started that server', async () => {
    llamaGetLog.mockResolvedValue(null)
    await useLlamaStore.getState().attachModel('m1')
    expect(useLlamaStore.getState().runs.m1).toBeUndefined()
  })

  it('subscribes once however many models start', async () => {
    llamaStart.mockResolvedValue(undefined)
    await useLlamaStore.getState().startModel('m1', {} as never)
    await useLlamaStore.getState().startModel('m2', {} as never)
    expect(listeners.data).toHaveLength(1)

    emitData('m2', 'hi\n')
    emitExit('m2', 1)
    expect(useLlamaStore.getState().runs.m2).toMatchObject({ running: false, exitCode: 1, error: 'hi\n' })
    expect(useLlamaStore.getState().runs.m1).toMatchObject({ running: true, output: '' })
  })

  it('probeModel keeps the output it already has', async () => {
    useLlamaStore.setState({ runs: { m1: { running: false, output: 'log', error: null, exitCode: null, logged: true } } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    await useLlamaStore.getState().probeModel('m1', '127.0.0.1', 8080)
    expect(useLlamaStore.getState().runs.m1).toMatchObject({ running: true, output: 'log', logged: true })
  })

  it('checkAvailable sets available from window.api', async () => {
    llamaIsAvailable.mockResolvedValue(true)
    await useLlamaStore.getState().checkAvailable()
    expect(useLlamaStore.getState().available).toBe(true)
    expect(useLlamaStore.getState().checking).toBe(false)
  })

  it('checkAvailable resolves false when the api rejects (no retry loop)', async () => {
    llamaIsAvailable.mockRejectedValueOnce(new Error('unavailable'))
    await useLlamaStore.getState().checkAvailable()
    expect(useLlamaStore.getState().available).toBe(false)
    expect(useLlamaStore.getState().checking).toBe(false)
  })

  it('checkAvailable does not double-fire while already checking', async () => {
    llamaIsAvailable.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(true), 10)),
    )
    const first = useLlamaStore.getState().checkAvailable()
    const second = useLlamaStore.getState().checkAvailable()
    await Promise.all([first, second])
    // Only one underlying probe despite two callers racing.
    expect(llamaIsAvailable).toHaveBeenCalledTimes(1)
    expect(useLlamaStore.getState().available).toBe(true)
  })
})
