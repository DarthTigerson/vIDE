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
    bridgeSetReasoningEffort: vi.fn(),
    bridgeCompact: vi.fn(),
    onBridgeEvent: vi.fn((_cb: (event: any) => void) => () => {}),
  }
  ;(global as any).window = { api: apiMock }
  return { store, apiMock }
})

import { useBridgeStore } from '../bridgeStore'
import { useBridgeSettingsStore } from '../bridgeSettingsStore'
import { useTodoMcpStore } from '../todoMcpStore'
import { useNotesMcpStore } from '../notesMcpStore'

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
    expect(conv('A').messages).toEqual([{ role: 'user', content: 'hello' }, { role: 'assistant', content: '', startedAt: expect.any(Number) }])
    expect(conv('A').streaming).toBe(true)
    expect(conv('B').messages).toEqual([])
    expect(apiMock.bridgeSend).toHaveBeenCalledWith(
      '/p', [{ role: 'user', content: 'hello' }], false,
      expect.objectContaining({ sessionId: conv('A').historyId }), 'A',
    )
  })

  it('sends the Bridge tool call limit, or the connection override\'s limit for llama models', () => {
    useBridgeSettingsStore.setState({ toolCallLimit: 25 })
    useBridgeStore.getState().sendMessage('A', '/p', 'bridge')
    expect(apiMock.bridgeSend).toHaveBeenLastCalledWith('/p', expect.any(Array), false, expect.objectContaining({ toolCallLimit: 25 }), 'A')
    useBridgeStore.getState().sendMessage('B', '/p', 'llama', { endpoint: 'http://127.0.0.1:8899/v1', apiKey: 'local', modelId: 'm', toolCallLimit: 0 })
    expect(apiMock.bridgeSend).toHaveBeenLastCalledWith('/p', expect.any(Array), true, expect.objectContaining({ toolCallLimit: 0 }), 'B')
  })

  it('sends the vIDE tool groups whose MCP toggles are on', () => {
    useTodoMcpStore.setState({ enabled: true })
    useNotesMcpStore.setState({ enabled: false })
    useBridgeStore.getState().sendMessage('A', '/p', 'hi')
    const settings = apiMock.bridgeSend.mock.calls.at(-1)![3]
    expect(settings.videTools).toContain('todos')
    expect(settings.videTools).not.toContain('notes')
  })

  it('a mid-turn compaction puts the marker before the in-flight reply, and later turns are sent from it', () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'build the spec')
    emit({ type: 'text-delta', delta: 'working', sessionId: 'A' })
    emit({ type: 'compacting', sessionId: 'A' })
    expect(conv('A').compacting).toBe(true)
    emit({ type: 'compacted', summary: 'S', content: '[sum]\n\nS', sessionId: 'A' })
    emit({ type: 'done', sessionId: 'A' })

    expect(conv('A').compacting).toBe(false)
    expect(conv('A').messages.map((m) => m.compaction ? 'marker' : m.role)).toEqual(['user', 'marker', 'assistant'])

    useBridgeStore.getState().sendMessage('A', '/p', 'next')
    expect(apiMock.bridgeSend.mock.calls.at(-1)![1]).toEqual([
      { role: 'user', content: '[sum]\n\nS' },
      { role: 'assistant', content: 'working' },
      { role: 'user', content: 'next' },
    ])
  })

  it('keeps reasoning on the message, times it, and never sends it back to the model', () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'q1')
    emit({ type: 'reasoning-delta', delta: 'think ', sessionId: 'A' })
    emit({ type: 'reasoning-delta', delta: 'more', sessionId: 'A' })
    const live = conv('A').messages[1]
    expect(live.reasoning).toBe('think more')
    expect(live.reasoningMs).toBeUndefined()

    emit({ type: 'text-delta', delta: 'a1', sessionId: 'A' })
    expect(conv('A').messages[1].reasoningMs).toEqual(expect.any(Number))
    emit({ type: 'done', sessionId: 'A' })
    expect(conv('A').messages[1].endedAt).toEqual(expect.any(Number))

    useBridgeStore.getState().sendMessage('A', '/p', 'q2')
    const wire = apiMock.bridgeSend.mock.calls[apiMock.bridgeSend.mock.calls.length - 1][1]
    expect(wire).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
    ])
  })

  it('sends a chosen reasoning effort with the next message', () => {
    useBridgeStore.getState().setReasoningEffort('A', 'high', 'medium')
    useBridgeStore.getState().sendMessage('A', '/p', 'q1')
    const settings = apiMock.bridgeSend.mock.calls[apiMock.bridgeSend.mock.calls.length - 1][3]
    expect(settings.reasoningEffort).toBe('high')
    expect(apiMock.bridgeSetReasoningEffort).not.toHaveBeenCalled()
  })

  it('mid-turn, pushes the effort to the running conversation and marks the round', () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'q1')
    useBridgeStore.getState().setReasoningEffort('A', 'low', 'medium')
    useBridgeStore.getState().setReasoningEffort('A', 'high', 'low')
    expect(apiMock.bridgeSetReasoningEffort).toHaveBeenLastCalledWith('high', 'A')
    expect(conv('A').messages[1].effortChange).toEqual({ from: 'medium', to: 'high' })

    // Changing back to where the round started clears the marker.
    useBridgeStore.getState().setReasoningEffort('A', 'medium', 'high')
    expect(conv('A').messages[1].effortChange).toBeUndefined()
  })

  it('keeps a round that only reasoned instead of dropping it as empty', () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'q1')
    emit({ type: 'reasoning-delta', delta: 'hmm', sessionId: 'A' })
    emit({ type: 'done', sessionId: 'A' })
    expect(conv('A').messages[1]).toMatchObject({ role: 'assistant', reasoning: 'hmm', reasoningMs: expect.any(Number) })
  })

  it('manual compact appends a marker, and the next message merges into it so roles still alternate', async () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'q1')
    emit({ type: 'text-delta', delta: 'a1', sessionId: 'A' })
    emit({ type: 'done', sessionId: 'A' })
    apiMock.bridgeCompact.mockResolvedValue({ ok: true, summary: 'S', content: '[sum]\n\nS' })

    await useBridgeStore.getState().compact('A', undefined, 'the API')

    expect(apiMock.bridgeCompact).toHaveBeenCalledWith(expect.objectContaining({
      messages: [{ role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }],
      focus: 'the API',
    }))
    expect(conv('A').messages.at(-1)).toEqual({ role: 'user', content: '[sum]\n\nS', compaction: { summary: 'S' } })
    useBridgeStore.getState().sendMessage('A', '/p', 'q2')
    expect(apiMock.bridgeSend.mock.calls.at(-1)![1]).toEqual([{ role: 'user', content: '[sum]\n\nS\n\nq2' }])
  })

  it('a failed manual compact leaves the transcript sendable and says why', async () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'q1')
    emit({ type: 'done', sessionId: 'A' })
    apiMock.bridgeCompact.mockResolvedValue({ ok: false, error: 'HTTP 500' })

    await useBridgeStore.getState().compact('A')

    expect(conv('A').compacting).toBe(false)
    expect(conv('A').messages.at(-1)).toEqual({ role: 'assistant', content: '**Compaction failed:** HTTP 500' })
  })

  it('records context usage from the main process', () => {
    useBridgeStore.getState().sendMessage('A', '/p', 'q')
    emit({ type: 'usage', usedTokens: 41000, contextWindow: 65536, sessionId: 'A' })
    expect(conv('A').contextUsage).toEqual({ usedTokens: 41000, contextWindow: 65536 })
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
    expect(conv('A').messages).toEqual([{ role: 'user', content: 'q1' }, { role: 'assistant', content: '', startedAt: expect.any(Number) }])
    expect(apiMock.bridgeSend).toHaveBeenLastCalledWith('/p', [{ role: 'user', content: 'q1' }], false, expect.any(Object), 'A')
  })
})
