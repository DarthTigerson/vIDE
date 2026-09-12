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
})
