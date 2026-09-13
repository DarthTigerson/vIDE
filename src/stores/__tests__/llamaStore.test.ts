import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLlamaStore } from '../llamaStore'

const { llamaIsAvailable } = vi.hoisted(() => ({ llamaIsAvailable: vi.fn() }))

vi.stubGlobal('window', {
  api: {
    llamaIsAvailable,
  },
})

describe('llamaStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useLlamaStore.setState({ available: null, checking: false })
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
