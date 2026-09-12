import { describe, it, expect, beforeEach, vi } from 'vitest'
import { registerChannel, dispatch, resetChannelsForTest } from '../dispatch'

describe('dispatch', () => {
  beforeEach(() => {
    resetChannelsForTest()
    vi.clearAllMocks()
  })

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

  it('logs and swallows errors from send-type handlers without rejecting', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    registerChannel('sendBoom', () => { throw new Error('send error') })
    const res = await dispatch({ type: 'send', method: 'sendBoom', args: [] })
    expect(res).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[relay:send] error in handler for 'sendBoom':",
      'send error'
    )
    consoleErrorSpy.mockRestore()
  })

  it('logs and swallows promise rejections from async send-type handlers', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    registerChannel('asyncSendBoom', async () => { throw new Error('async send error') })
    const res = await dispatch({ type: 'send', method: 'asyncSendBoom', args: [] })
    expect(res).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[relay:send] error in handler for 'asyncSendBoom':",
      'async send error'
    )
    consoleErrorSpy.mockRestore()
  })
})
