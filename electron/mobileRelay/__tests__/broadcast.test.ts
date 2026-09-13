import { describe, it, expect, vi } from 'vitest'
import { createBroadcaster } from '../broadcast'

describe('createBroadcaster', () => {
  it('forwards a push event to every registered mobile connection', () => {
    const sentTo: unknown[] = []
    const conn = { id: 'a', send: (msg: unknown) => sentTo.push(msg), onMessage: vi.fn(), onClose: vi.fn() }
    const broadcaster = createBroadcaster()
    broadcaster.addConnection(conn as never)
    broadcaster.emit('git:changed', '/repo')
    expect(sentTo).toEqual([{ type: 'event', event: 'git:changed', args: ['/repo'] }])
  })

  it('stops sending to a connection after it closes', () => {
    const sentTo: unknown[] = []
    let closeCb: () => void = () => {}
    const conn = {
      id: 'a', send: (msg: unknown) => sentTo.push(msg), onMessage: vi.fn(),
      onClose: (cb: () => void) => { closeCb = cb },
    }
    const broadcaster = createBroadcaster()
    broadcaster.addConnection(conn as never)
    closeCb()
    broadcaster.emit('git:changed', '/repo')
    expect(sentTo).toEqual([])
  })

  it('keeps delivering to other connections and does not throw when one connection\'s send throws', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sentTo: unknown[] = []
    const badConn = {
      id: 'bad',
      send: () => { throw new Error('socket is closing') },
      onMessage: vi.fn(),
      onClose: vi.fn(),
    }
    const goodConn = {
      id: 'good',
      send: (msg: unknown) => sentTo.push(msg),
      onMessage: vi.fn(),
      onClose: vi.fn(),
    }
    const broadcaster = createBroadcaster()
    broadcaster.addConnection(badConn as never)
    broadcaster.addConnection(goodConn as never)

    expect(() => broadcaster.emit('git:changed', '/repo')).not.toThrow()

    expect(sentTo).toEqual([{ type: 'event', event: 'git:changed', args: ['/repo'] }])
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[relay:broadcast] error sending 'git:changed' to connection 'bad':",
      'socket is closing'
    )
    consoleErrorSpy.mockRestore()
  })
})
