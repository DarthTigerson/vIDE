import { describe, it, expect, beforeEach, vi } from 'vitest'

const { store, apiMock } = vi.hoisted(() => {
  const store: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
  }
  const apiMock = {
    bridgeSend: vi.fn(),
    bridgeApprove: vi.fn(),
    bridgeReject: vi.fn(),
    bridgeCancel: vi.fn(),
    onBridgeEvent: vi.fn((_cb: (event: any) => void) => () => {}),
  }
  ;(global as any).window = { api: apiMock }
  return { store, apiMock }
})

import { useBridgeStore } from '../bridgeStore'

describe('bridgeStore', () => {
  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k])
    vi.clearAllMocks()
    useBridgeStore.setState({ messages: [], previousMessages: [], agentMode: false, streaming: false })
  })

  it('sendMessage appends a user message and calls window.api.bridgeSend', () => {
    useBridgeStore.getState().sendMessage('/project', 'hello')

    const state = useBridgeStore.getState()
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]).toMatchObject({ role: 'user', content: 'hello' })
    expect(state.streaming).toBe(true)
    expect(apiMock.bridgeSend).toHaveBeenCalledWith('/project', [{ role: 'user', content: 'hello' }], false, expect.any(Object))
  })

  it('toggleAgentMode flips and persists agentMode', () => {
    useBridgeStore.getState().toggleAgentMode()
    expect(useBridgeStore.getState().agentMode).toBe(true)
    expect(store['vide:bridge:agentMode']).toBe('true')
  })

  it('newSession moves current messages to previousMessages and clears the transcript', () => {
    useBridgeStore.setState({ messages: [{ role: 'user', content: 'hi', status: 'done' } as any] })
    useBridgeStore.getState().newSession()

    const state = useBridgeStore.getState()
    expect(state.messages).toEqual([])
    expect(state.previousMessages).toHaveLength(1)
  })

  it('previousSession restores the saved transcript', () => {
    useBridgeStore.setState({ previousMessages: [{ role: 'user', content: 'old', status: 'done' } as any] })
    useBridgeStore.getState().previousSession()

    expect(useBridgeStore.getState().messages).toEqual([{ role: 'user', content: 'old', status: 'done' }])
  })

  it('approveToolCall/rejectToolCall delegate to window.api', () => {
    useBridgeStore.getState().approveToolCall('call_1')
    useBridgeStore.getState().rejectToolCall('call_2')
    expect(apiMock.bridgeApprove).toHaveBeenCalledWith('call_1')
    expect(apiMock.bridgeReject).toHaveBeenCalledWith('call_2')
  })

  it('handles a text-delta event by appending to the in-progress assistant message', () => {
    let handler: (e: any) => void = () => {}
    apiMock.onBridgeEvent.mockImplementation((cb) => { handler = cb; return () => {} })
    useBridgeStore.getState().initEventListener()

    useBridgeStore.getState().sendMessage('/project', 'hi')
    handler({ type: 'text-delta', delta: 'Hel' })
    handler({ type: 'text-delta', delta: 'lo' })

    const messages = useBridgeStore.getState().messages
    expect(messages[messages.length - 1]).toMatchObject({ role: 'assistant', content: 'Hello' })
  })

  it('handles a done event by clearing streaming state', () => {
    let handler: (e: any) => void = () => {}
    apiMock.onBridgeEvent.mockImplementation((cb) => { handler = cb; return () => {} })
    useBridgeStore.getState().initEventListener()

    useBridgeStore.getState().sendMessage('/project', 'hi')
    handler({ type: 'done' })

    expect(useBridgeStore.getState().streaming).toBe(false)
  })

  it('handles need-approval by adding a pending tool-call block to the assistant message', () => {
    let handler: (e: any) => void = () => {}
    apiMock.onBridgeEvent.mockImplementation((cb) => { handler = cb; return () => {} })
    useBridgeStore.getState().initEventListener()

    useBridgeStore.getState().sendMessage('/project', 'hi')
    handler({ type: 'tool-call', id: 'call_1', name: 'write_file', args: { path: '/x' } })
    handler({ type: 'need-approval', id: 'call_1', name: 'write_file', args: { path: '/x' } })

    const messages = useBridgeStore.getState().messages
    const assistantMsg = messages[messages.length - 1]
    expect(assistantMsg.toolCalls?.[0]).toMatchObject({ id: 'call_1', name: 'write_file', status: 'pending-approval' })
  })

  it('handles tool-result by updating the matching tool-call block to done/error', () => {
    let handler: (e: any) => void = () => {}
    apiMock.onBridgeEvent.mockImplementation((cb) => { handler = cb; return () => {} })
    useBridgeStore.getState().initEventListener()

    useBridgeStore.getState().sendMessage('/project', 'hi')
    handler({ type: 'tool-call', id: 'call_1', name: 'write_file', args: { path: '/x' } })
    handler({ type: 'tool-result', id: 'call_1', result: 'Wrote 2 bytes', isError: false })

    const messages = useBridgeStore.getState().messages
    const assistantMsg = messages[messages.length - 1]
    expect(assistantMsg.toolCalls?.[0]).toMatchObject({ id: 'call_1', status: 'done', result: 'Wrote 2 bytes' })
  })

  describe('draft input', () => {
    beforeEach(() => {
      useBridgeStore.setState({ draftInput: '' })
    })

    it('setDraftInput replaces the draft', () => {
      useBridgeStore.getState().setDraftInput('hello')
      expect(useBridgeStore.getState().draftInput).toBe('hello')
    })

    it('appendDraftInput appends onto existing text with a newline separator', () => {
      useBridgeStore.getState().setDraftInput('question?')
      useBridgeStore.getState().appendDraftInput('```ts\ncode\n```')
      expect(useBridgeStore.getState().draftInput).toBe('question?\n```ts\ncode\n```')
    })

    it('appendDraftInput on an empty draft does not add a leading newline', () => {
      useBridgeStore.getState().appendDraftInput('```ts\ncode\n```')
      expect(useBridgeStore.getState().draftInput).toBe('```ts\ncode\n```')
    })
  })
})
