import { describe, it, expect, vi, beforeEach } from 'vitest'

const { instances } = vi.hoisted(() => ({ instances: [] as any[] }))

vi.mock('chokidar', () => ({
  watch: () => {
    let resolveClose!: () => void
    const closePromise = new Promise<void>((r) => { resolveClose = r })
    const instance = {
      close: vi.fn(() => closePromise),
      finishClose: () => resolveClose(),
    }
    instances.push(instance)
    return instance
  },
}))

import { watch, closeAllWatchers, openWatcherCount } from '../fsWatchers'

describe('fsWatchers', () => {
  beforeEach(async () => {
    // Drain anything a previous test left registered.
    const drain = closeAllWatchers()
    instances.forEach((i) => i.finishClose())
    await drain
    instances.length = 0
  })

  it('tracks every watcher it opens', () => {
    watch('/a')
    watch('/b')
    expect(openWatcherCount()).toBe(2)
  })

  it('closes every watcher and waits for all closes to finish', async () => {
    watch('/a')
    watch('/b')
    let done = false
    const p = closeAllWatchers().then(() => { done = true })
    await Promise.resolve()
    await Promise.resolve()
    expect(instances.every((i) => i.close.mock.calls.length === 1)).toBe(true)
    instances[0].finishClose()
    await new Promise((r) => setTimeout(r, 0))
    expect(done).toBe(false)
    instances[1].finishClose()
    await p
    expect(done).toBe(true)
    expect(openWatcherCount()).toBe(0)
  })

  it('a watcher whose close rejects does not block the rest', async () => {
    watch('/a')
    instances[0].close.mockImplementation(() => Promise.reject(new Error('boom')))
    await expect(closeAllWatchers()).resolves.toBeUndefined()
  })
})
