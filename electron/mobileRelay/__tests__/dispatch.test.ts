import { describe, it, expect, beforeEach } from 'vitest'
import { registerChannel, dispatch, resetChannelsForTest } from '../dispatch'

describe('dispatch', () => {
  beforeEach(() => resetChannelsForTest())

  it('invokes a registered channel and returns its result', async () => {
    registerChannel('echo', (msg: unknown) => msg)
    const res = await dispatch({ type: 'invoke', id: '1', method: 'echo', args: ['hi'] })
    expect(res).toEqual({ type: 'response', id: '1', result: 'hi' })
  })

  it('returns an error envelope for an unknown method', async () => {
    const res = await dispatch({ type: 'invoke', id: '2', method: 'nope', args: [] })
    expect(res).toEqual({ type: 'response', id: '2', error: 'Unknown method: nope' })
  })

  it('returns an error envelope when the handler throws', async () => {
    registerChannel('boom', () => { throw new Error('kaboom') })
    const res = await dispatch({ type: 'invoke', id: '3', method: 'boom', args: [] })
    expect(res).toEqual({ type: 'response', id: '3', error: 'kaboom' })
  })

  it('dispatches a send-type message with no response', async () => {
    let called: unknown[] = []
    registerChannel('fireAndForget', (...args) => { called = args })
    const res = await dispatch({ type: 'send', method: 'fireAndForget', args: [1, 2] })
    expect(res).toBeNull()
    expect(called).toEqual([1, 2])
  })
})
