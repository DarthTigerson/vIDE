import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { watchMock, watcherInstances, getAllWindowsMock } = vi.hoisted(() => ({
  watchMock: vi.fn(),
  watcherInstances: [] as any[],
  getAllWindowsMock: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: getAllWindowsMock },
}))

vi.mock('chokidar', () => ({
  watch: (...args: unknown[]) => {
    watchMock(...args)
    const handlers: Record<string, (...a: any[]) => void> = {}
    const instance = {
      on: (event: string, fn: (...a: any[]) => void) => {
        handlers[event] = fn
      },
      close: vi.fn(),
      __trigger: (event: string, ...args: any[]) => handlers[event]?.(...args),
    }
    watcherInstances.push(instance)
    return instance
  },
}))

import { TodosWatcher } from '../todosWatcher'

function fakeWin(destroyed = false) {
  return { isDestroyed: () => destroyed, webContents: { send: vi.fn() } }
}

describe('TodosWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    watchMock.mockReset()
    watcherInstances.length = 0
    getAllWindowsMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('watches the given path ignoring the initial add events', () => {
    const watcher = new TodosWatcher()
    watcher.start('/fake/userData/todos.json')

    expect(watchMock).toHaveBeenCalledWith('/fake/userData/todos.json', { ignoreInitial: true })
  })

  it('calling start twice does not create a second watcher', () => {
    const watcher = new TodosWatcher()
    watcher.start('/fake/userData/todos.json')
    watcher.start('/fake/userData/todos.json')

    expect(watchMock).toHaveBeenCalledTimes(1)
  })

  it('broadcasts todos:changed to every open, non-destroyed window after a change', () => {
    const winA = fakeWin()
    const winB = fakeWin(true)
    getAllWindowsMock.mockReturnValue([winA, winB])

    const watcher = new TodosWatcher()
    watcher.start('/fake/userData/todos.json')
    watcherInstances[0].__trigger('all')
    vi.advanceTimersByTime(300)

    expect(winA.webContents.send).toHaveBeenCalledWith('todos:changed')
    expect(winB.webContents.send).not.toHaveBeenCalled()
  })

  it('debounces a burst of change events into a single broadcast', () => {
    const win = fakeWin()
    getAllWindowsMock.mockReturnValue([win])

    const watcher = new TodosWatcher()
    watcher.start('/fake/userData/todos.json')
    watcherInstances[0].__trigger('all')
    watcherInstances[0].__trigger('all')
    watcherInstances[0].__trigger('all')
    vi.advanceTimersByTime(300)

    expect(win.webContents.send).toHaveBeenCalledTimes(1)
  })

  it('stop closes the watcher and cancels any pending broadcast', () => {
    const win = fakeWin()
    getAllWindowsMock.mockReturnValue([win])

    const watcher = new TodosWatcher()
    watcher.start('/fake/userData/todos.json')
    watcherInstances[0].__trigger('all')
    watcher.stop()
    vi.advanceTimersByTime(300)

    expect(watcherInstances[0].close).toHaveBeenCalled()
    expect(win.webContents.send).not.toHaveBeenCalled()
  })
})
