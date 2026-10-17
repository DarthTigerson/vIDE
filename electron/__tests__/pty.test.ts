import { describe, it, expect, beforeEach, vi } from 'vitest'

const { handlers, spawnMock } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => void>,
  spawnMock: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => unknown) => {
      handlers[channel] = fn
    },
    on: (channel: string, fn: (...args: any[]) => unknown) => {
      handlers[channel] = fn
    },
  },
  BrowserWindow: {
    fromWebContents: (sender: any) => sender,
  },
}))

vi.mock('node-pty', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}))

import { PtyManager } from '../pty'

function fakeWin(id: number) {
  return { id, webContents: { send: vi.fn() } }
}

function fakePty() {
  return { onData: vi.fn(), onExit: vi.fn(), kill: vi.fn(), write: vi.fn(), resize: vi.fn() }
}

describe('PtyManager multi-window isolation', () => {
  beforeEach(() => {
    spawnMock.mockReset()
  })

  it('spawning a terminal with the same id in two different windows creates two independent processes', () => {
    const manager = new PtyManager()
    manager.registerHandlers()
    const winA = fakeWin(1)
    const winB = fakeWin(2)
    const procA = fakePty()
    const procB = fakePty()
    spawnMock.mockReturnValueOnce(procA).mockReturnValueOnce(procB)

    handlers['term:spawn']({ sender: winA }, 'term-1', '/project/a')
    handlers['term:spawn']({ sender: winB }, 'term-1', '/project/b')

    expect(spawnMock).toHaveBeenCalledTimes(2)
    expect(spawnMock.mock.calls[1][2]).toMatchObject({ cwd: '/project/b' })
  })

  it('writing to a terminal in window A does not affect window B\'s same-id process', () => {
    const manager = new PtyManager()
    manager.registerHandlers()
    const winA = fakeWin(1)
    const winB = fakeWin(2)
    const procA = fakePty()
    const procB = fakePty()
    spawnMock.mockReturnValueOnce(procA).mockReturnValueOnce(procB)

    handlers['term:spawn']({ sender: winA }, 'term-1', '/project/a')
    handlers['term:spawn']({ sender: winB }, 'term-1', '/project/b')
    handlers['term:write']({ sender: winA }, 'term-1', 'echo hi\n')

    expect(procA.write).toHaveBeenCalledWith('echo hi\n')
    expect(procB.write).not.toHaveBeenCalled()
  })

  it('disposeWindow kills only that window\'s processes', () => {
    const manager = new PtyManager()
    manager.registerHandlers()
    const winA = fakeWin(1)
    const winB = fakeWin(2)
    const procA = fakePty()
    const procB = fakePty()
    spawnMock.mockReturnValueOnce(procA).mockReturnValueOnce(procB)

    handlers['term:spawn']({ sender: winA }, 'term-1', '/project/a')
    handlers['term:spawn']({ sender: winB }, 'term-1', '/project/b')
    manager.disposeWindow(1)

    expect(procA.kill).toHaveBeenCalled()
    expect(procB.kill).not.toHaveBeenCalled()
  })
})

describe('PtyManager.watch', () => {
  beforeEach(() => {
    spawnMock.mockReset()
  })

  it('delivers data and exit for a watcher registered before spawn, scoped to its window, until unsubscribed', () => {
    const manager = new PtyManager()
    manager.registerHandlers()
    const win = { ...fakeWin(1), isDestroyed: () => false }
    const proc = fakePty()
    spawnMock.mockReturnValueOnce(proc)
    const onData = vi.fn()
    const onExit = vi.fn()
    const otherWindow = vi.fn()

    const unsubscribe = manager.watch(1, 'script-1', onData, onExit)
    manager.watch(2, 'script-1', otherWindow, () => {})
    handlers['term:spawn']({ sender: win }, 'script-1', '/p')

    const emitData = proc.onData.mock.calls[0][0]
    const emitExit = proc.onExit.mock.calls[0][0]
    emitData('hello')
    expect(onData).toHaveBeenCalledWith('hello')
    expect(otherWindow).not.toHaveBeenCalled()

    emitExit()
    expect(onExit).toHaveBeenCalled()

    unsubscribe()
    emitData('later')
    expect(onData).toHaveBeenCalledTimes(1)
  })
})
