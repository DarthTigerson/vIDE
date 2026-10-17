import { describe, it, expect, beforeEach, vi } from 'vitest'

const { store, apiMock } = vi.hoisted(() => {
  const store: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
  }
  // Legacy single-session key from before multi-session Bridge — migrated
  // into history once at import time.
  store['vide:bridge:current'] = JSON.stringify({ id: 'legacy-1', messages: [{ role: 'user', content: 'old question' }] })
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

let emit: (e: any) => void = () => {}

function conv(id: string) {
  return useBridgeStore.getState().conversations[id]
}

describe('bridgeStore legacy migration', () => {
  it('moves the old global current conversation into history and deletes the key', () => {
    expect(store['vide:bridge:current']).toBeUndefined()
    expect(useBridgeStore.getState().history[0]).toMatchObject({ id: 'legacy-1', title: 'old question' })
  })
})

describe('bridgeStore conversations', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
    vi.clearAllMocks()
    useBridgeStore.setState({ conversations: {}, history: [] })
    apiMock.onBridgeEvent.mockImplementation((cb) => { emit = cb; return () => {} })
    useBridgeStore.getState().initEventListener()
    useBridgeStore.getState().openConversation('A', false)
    useBridgeStore.getState().openConversation('B', true)
  })

  it('openConversation creates an empty conversation with the given agent mode, and is idempotent', () => {
    expect(conv('A')).toMatchObject({ messages: [], agentMode: false, streaming: false, draftInput: '' })
    expect(conv('B').agentMode).toBe(true)
    useBridgeStore.getState().sendMessage('A', '/p', 'hi')
    useBridgeStore.getState().openConversation('A', true)
    expect(conv('A').messages).toHaveLength(2)
    expect(conv('A').agentMode).toBe(false)
  })

  it('openConversation reloads a conversation persisted under the session id', () => {
    store['vide:bridge:conv:C'] = JSON.stringify({ historyId: 'h-c', messages: [{ role: 'user', content: 'saved' }] })
    useBridgeStore.getState().openConversation('C', false)
    expect(conv('C')).toMatchObject({ historyId: 'h-c', messages: [{ role: 'user', content: 'saved' }] })
  })

  it('sendMessage only touches its own conversation and passes the session id over IPC', () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'hello')
    expect(conv('A').messages).toEqual([{ role: 'user', content: 'hello' }, { role: 'assistant', content: '' }])
    expect(conv('A').streaming).toBe(true)
    expect(conv('B').messages).toEqual([])
    expect(apiMock.bridgeSend).toHaveBeenCalledWith(
      '/p', [{ role: 'user', content: 'hello' }], false,
      expect.objectContaining({ sessionId: conv('A').historyId }), 'A',
    )
  })

  it('routes events by sessionId', () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'a')
    useBridgeStore.getState().sendMessage('B', '/p', 'b')
    emit({ type: 'text-delta', delta: 'to A', sessionId: 'A' })
    emit({ type: 'text-delta', delta: 'to B', sessionId: 'B' })
    emit({ type: 'done', sessionId: 'A' })
    expect(conv('A').messages.at(-1)).toMatchObject({ content: 'to A' })
    expect(conv('A').streaming).toBe(false)
    expect(conv('B').messages.at(-1)).toMatchObject({ content: 'to B' })
    expect(conv('B').streaming).toBe(true)
  })

  it('drops events for unknown or missing session ids', () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'a')
    const before = useBridgeStore.getState().conversations
    emit({ type: 'text-delta', delta: 'ghost', sessionId: 'closed-one' })
    emit({ type: 'text-delta', delta: 'ghost' })
    expect(useBridgeStore.getState().conversations).toBe(before)
  })

  it('persists a conversation under its session id when a turn finishes', () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'a')
    emit({ type: 'text-delta', delta: 'answer', sessionId: 'A' })
    emit({ type: 'done', sessionId: 'A' })
    expect(JSON.parse(store['vide:bridge:conv:A'])).toMatchObject({
      historyId: conv('A').historyId,
      messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'answer' }],
    })
  })

  it('cancel stops only that session and drops its empty placeholder', () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'a')
    useBridgeStore.getState().sendMessage('B', '/p', 'b')
    useBridgeStore.getState().cancel('A')
    expect(apiMock.bridgeCancel).toHaveBeenCalledWith('A')
    expect(conv('A')).toMatchObject({ streaming: false, messages: [{ role: 'user', content: 'a' }] })
    expect(conv('B').streaming).toBe(true)
  })

  it('cancel settles that session\'s pending/running tool calls (main emits nothing after a cancel)', () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'hi')
    emit({ type: 'tool-call', id: 'call_1', name: 'write_file', args: { path: '/x' }, sessionId: 'A' })
    emit({ type: 'need-approval', id: 'call_1', name: 'write_file', args: { path: '/x' }, sessionId: 'A' })
    emit({ type: 'tool-call', id: 'call_2', name: 'read_file', args: { path: '/y' }, sessionId: 'A' })
    useBridgeStore.getState().cancel('A')
    expect(conv('A').messages.at(-1)?.toolCalls).toEqual([
      expect.objectContaining({ id: 'call_1', status: 'error', result: 'Cancelled.' }),
      expect.objectContaining({ id: 'call_2', status: 'error', result: 'Cancelled.' }),
    ])
  })

  it('closeConversation keeps history another window wrote since this store loaded', () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'mine')
    const historyId = conv('A').historyId
    // Another window archived a session after this store read history.
    store['vide:bridge:sessions'] = JSON.stringify([{ id: 'other-win', messages: [{ role: 'user', content: 'theirs' }], timestamp: 1, title: 'theirs' }])
    useBridgeStore.getState().closeConversation('A')
    const stored = JSON.parse(store['vide:bridge:sessions']).map((s: any) => s.id)
    expect(stored).toEqual([historyId, 'other-win'])
    expect(useBridgeStore.getState().history.map((s) => s.id)).toEqual([historyId, 'other-win'])
  })

  it('clearConversation keeps history another window wrote since this store loaded', () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'mine')
    emit({ type: 'done', sessionId: 'A' })
    const historyId = conv('A').historyId
    store['vide:bridge:sessions'] = JSON.stringify([{ id: 'other-win', messages: [{ role: 'user', content: 'theirs' }], timestamp: 1, title: 'theirs' }])
    useBridgeStore.getState().clearConversation('A')
    expect(JSON.parse(store['vide:bridge:sessions']).map((s: any) => s.id)).toEqual([historyId, 'other-win'])
  })

  it('restorePrevious finds a session another window archived', () => {
    store['vide:bridge:sessions'] = JSON.stringify([{ id: 'other-win', messages: [{ role: 'user', content: 'theirs' }], timestamp: 1, title: 'theirs' }])
    expect(useBridgeStore.getState().restorePrevious('A')).toBe(true)
    expect(conv('A')).toMatchObject({ historyId: 'other-win', messages: [{ role: 'user', content: 'theirs' }] })
  })

  it('closeConversation cancels only that session, archives it, and forgets it', () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'question A')
    useBridgeStore.getState().sendMessage('B', '/p', 'b')
    store['vide:bridge:conv:A'] = '{}'
    const historyId = conv('A').historyId
    useBridgeStore.getState().closeConversation('A')
    expect(apiMock.bridgeCancel).toHaveBeenCalledWith('A')
    expect(apiMock.bridgeCancel).not.toHaveBeenCalledWith('B')
    expect(conv('A')).toBeUndefined()
    expect(store['vide:bridge:conv:A']).toBeUndefined()
    expect(useBridgeStore.getState().history[0]).toMatchObject({ id: historyId, title: 'question A' })
    expect(conv('B').streaming).toBe(true)
  })

  it('closeConversation of an empty conversation does not add a history entry', () => {
    useBridgeStore.getState().closeConversation('B')
    expect(useBridgeStore.getState().history).toEqual([])
  })

  it('clearConversation archives the transcript and starts fresh under a new history id', () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'first')
    emit({ type: 'done', sessionId: 'A' })
    const oldHistoryId = conv('A').historyId
    useBridgeStore.getState().clearConversation('A')
    expect(conv('A').messages).toEqual([])
    expect(conv('A').historyId).not.toBe(oldHistoryId)
    expect(useBridgeStore.getState().history[0].id).toBe(oldHistoryId)
  })

  it('restorePrevious loads the newest archived conversation that is not the current one', () => {
    store['vide:bridge:sessions'] = JSON.stringify([
      { id: 'h-new', messages: [{ role: 'user', content: 'newest' }], timestamp: 2, title: 'newest' },
      { id: 'h-old', messages: [{ role: 'user', content: 'older' }], timestamp: 1, title: 'older' },
    ])
    expect(useBridgeStore.getState().restorePrevious('A')).toBe(true)
    expect(conv('A')).toMatchObject({ historyId: 'h-new', messages: [{ role: 'user', content: 'newest' }] })
  })

  it('restorePrevious returns false with empty history', () => {
    expect(useBridgeStore.getState().restorePrevious('A')).toBe(false)
    expect(conv('A').messages).toEqual([])
  })

  it('approve/reject forward the session id', () => {
    useBridgeStore.getState().approveToolCall('A', 'call_1')
    useBridgeStore.getState().rejectToolCall('B', 'call_2')
    expect(apiMock.bridgeApprove).toHaveBeenCalledWith('call_1', 'A')
    expect(apiMock.bridgeReject).toHaveBeenCalledWith('call_2', 'B')
  })

  it('tool-call / need-approval / tool-result update the right conversation', () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'hi')
    emit({ type: 'tool-call', id: 'call_1', name: 'write_file', args: { path: '/x' }, sessionId: 'A' })
    emit({ type: 'need-approval', id: 'call_1', name: 'write_file', args: { path: '/x' }, sessionId: 'A' })
    expect(conv('A').messages.at(-1)?.toolCalls?.[0]).toMatchObject({ status: 'pending-approval' })
    emit({ type: 'tool-result', id: 'call_1', result: 'ok', isError: false, sessionId: 'A' })
    expect(conv('A').messages.at(-1)?.toolCalls?.[0]).toMatchObject({ status: 'done', result: 'ok' })
  })

  it('toggleAgentMode flips only that session', () => {
    useBridgeStore.getState().toggleAgentMode('A')
    expect(conv('A').agentMode).toBe(true)
    expect(conv('B').agentMode).toBe(true)
  })

  it('draft input is per session; append adds a newline separator only when non-empty', () => {
    useBridgeStore.getState().appendDraftInput('A', 'code')
    expect(conv('A').draftInput).toBe('code')
    useBridgeStore.getState().setDraftInput('B', 'question?')
    useBridgeStore.getState().appendDraftInput('B', 'code')
    expect(conv('B').draftInput).toBe('question?\ncode')
  })

  it('regenerate resends history up to and including the chosen user message', () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'q1')
    emit({ type: 'text-delta', delta: 'a1', sessionId: 'A' })
    emit({ type: 'done', sessionId: 'A' })
    useBridgeStore.getState().regenerate('A', '/p', 0)
    expect(conv('A').messages).toEqual([{ role: 'user', content: 'q1' }, { role: 'assistant', content: '' }])
    expect(apiMock.bridgeSend).toHaveBeenLastCalledWith('/p', [{ role: 'user', content: 'q1' }], false, expect.any(Object), 'A')
  })
})
