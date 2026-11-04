import { describe, it, expect, beforeEach, vi } from 'vitest'

const { handlers, watchMock, watcherInstances } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => void>,
  watchMock: vi.fn(),
  watcherInstances: [] as any[],
}))

vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, fn: (...args: any[]) => unknown) => {
      handlers[channel] = fn
    },
  },
  BrowserWindow: {
    fromWebContents: (sender: any) => sender,
  },
}))

vi.mock('chokidar', () => ({
  watch: (...args: unknown[]) => {
    watchMock(...args)
    const instance = { on: vi.fn(), close: vi.fn() }
    watcherInstances.push(instance)
    return instance
  },
}))

import { FileWatcher } from '../fileWatcher'

function fakeWin(id: number) {
  return { id, webContents: { send: vi.fn() }, isDestroyed: () => false }
}

describe('FileWatcher multi-window isolation', () => {
  beforeEach(() => {
    watchMock.mockReset()
    watcherInstances.length = 0
  })

  it('watching different roots in two windows creates two independent watchers', () => {
    const manager = new FileWatcher()
    manager.registerHandlers()
    const winA = fakeWin(1)
    const winB = fakeWin(2)

    handlers['fs:watchRoot']({ sender: winA }, '/project/a')
    handlers['fs:watchRoot']({ sender: winB }, '/project/b')

    expect(watchMock).toHaveBeenCalledTimes(2)
    expect(watcherInstances[0].close).not.toHaveBeenCalled()
    expect(watcherInstances[1].close).not.toHaveBeenCalled()
  })

  it('re-watching the same root for the same window is a no-op', () => {
    const manager = new FileWatcher()
    manager.registerHandlers()
    const winA = fakeWin(1)

    handlers['fs:watchRoot']({ sender: winA }, '/project/a')
    handlers['fs:watchRoot']({ sender: winA }, '/project/a')

    expect(watchMock).toHaveBeenCalledTimes(1)
  })

  it('disposeWindow closes only that window\'s watcher', () => {
    const manager = new FileWatcher()
    manager.registerHandlers()
    const winA = fakeWin(1)
    const winB = fakeWin(2)

    handlers['fs:watchRoot']({ sender: winA }, '/project/a')
    handlers['fs:watchRoot']({ sender: winB }, '/project/b')
    manager.disposeWindow(1)

    expect(watcherInstances[0].close).toHaveBeenCalled()
    expect(watcherInstances[1].close).not.toHaveBeenCalled()
  })

  it('debounces change notifications and sends fs:changed after quiet period', () => {
    vi.useFakeTimers()
    const manager = new FileWatcher()
    manager.registerHandlers()
    const winA = fakeWin(1)

    handlers['fs:watchRoot']({ sender: winA }, '/project/a')
    const onAll = watcherInstances[0].on.mock.calls.find((c: any[]) => c[0] === 'all')[1]

    onAll('change', '/project/a/x.ts')
    onAll('add', '/project/a/y.ts')
    onAll('change', '/project/a/x.ts')
    expect(winA.webContents.send).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(winA.webContents.send).toHaveBeenCalledTimes(1)
    expect(winA.webContents.send).toHaveBeenCalledWith('fs:changed', '/project/a', ['/project/a/x.ts', '/project/a/y.ts'])

    // The next burst only carries its own paths.
    onAll('unlink', '/project/a/z.ts')
    vi.advanceTimersByTime(300)
    expect(winA.webContents.send).toHaveBeenLastCalledWith('fs:changed', '/project/a', ['/project/a/z.ts'])
    vi.useRealTimers()
  })
})
