import { describe, it, expect, beforeEach, vi } from 'vitest'

const { store } = vi.hoisted(() => {
  const store: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
  }
  return { store }
})

import { useClaudeStore } from '../claudeStore'
import { useBridgeStore } from '../bridgeStore'

beforeEach(() => {
  vi.clearAllMocks()
  if (!(global as any).window) {
    (global as any).window = {}
  }
  ;(global as any).window.api = {
    ...(((global as any).window as any).api ?? {}),
    claudeSpawn: vi.fn(),
    claudeWrite: vi.fn(),
    claudeKill: vi.fn(),
    sessionSave: vi.fn(),
    bridgeSend: vi.fn(), bridgeCancel: vi.fn(), bridgeApprove: vi.fn(), bridgeReject: vi.fn(), onBridgeEvent: vi.fn(() => () => {}),
  }
})

describe('claudeStore selection hand-off', () => {
  beforeEach(() => {
    useClaudeStore.setState({ chatVisible: true, pendingInjection: null, focusToken: 0 })
  })

  it('sendSelection opens the panel, sets pendingInjection, and bumps focusToken', () => {
    useClaudeStore.setState({ chatVisible: false })
    useClaudeStore.getState().sendSelection('In src/foo.ts (line 1):\n```ts\ncode\n```')

    const state = useClaudeStore.getState()
    expect(state.chatVisible).toBe(true)
    expect(state.pendingInjection).toBe('In src/foo.ts (line 1):\n```ts\ncode\n```')
    expect(state.focusToken).toBe(1)
  })

  it('focusChat opens the panel and bumps focusToken without setting pendingInjection', () => {
    useClaudeStore.setState({ chatVisible: false })
    useClaudeStore.getState().focusChat()

    const state = useClaudeStore.getState()
    expect(state.chatVisible).toBe(true)
    expect(state.pendingInjection).toBeNull()
    expect(state.focusToken).toBe(1)
  })

  it('focusChat leaves an already-open panel open (never closes it)', () => {
    useClaudeStore.getState().focusChat()
    expect(useClaudeStore.getState().chatVisible).toBe(true)
  })

  it('consumeInjection clears pendingInjection', () => {
    useClaudeStore.getState().sendSelection('text')
    useClaudeStore.getState().consumeInjection()
    expect(useClaudeStore.getState().pendingInjection).toBeNull()
  })

  it('bumps focusToken further on each subsequent call', () => {
    useClaudeStore.getState().sendSelection('first')
    useClaudeStore.getState().sendSelection('second')

    const state = useClaudeStore.getState()
    expect(state.focusToken).toBe(2)
    expect(state.pendingInjection).toBe('second')
  })
})

describe('claudeStore.setChatVisible', () => {
  it('sets chatVisible directly, in either direction', () => {
    useClaudeStore.setState({ chatVisible: true })
    useClaudeStore.getState().setChatVisible(false)
    expect(useClaudeStore.getState().chatVisible).toBe(false)

    useClaudeStore.getState().setChatVisible(true)
    expect(useClaudeStore.getState().chatVisible).toBe(true)
  })
})

describe('claudeStore.usage / cost mutual exclusion', () => {
  beforeEach(() => {
    useClaudeStore.setState({ instances: [{ id: 'c', kind: 'claude', hue: '#D97757' }], activeInstanceId: 'c', usageOpen: false, costOpen: false })
  })

  it('opening Usage closes Cost', () => {
    useClaudeStore.setState({ costOpen: true })
    useClaudeStore.getState().usage()
    const state = useClaudeStore.getState()
    expect(state.usageOpen).toBe(true)
    expect(state.costOpen).toBe(false)
  })

  it('opening Cost closes Usage', () => {
    useClaudeStore.setState({ usageOpen: true })
    useClaudeStore.getState().cost()
    const state = useClaudeStore.getState()
    expect(state.costOpen).toBe(true)
    expect(state.usageOpen).toBe(false)
  })

  it('closing Usage leaves Cost as it was', () => {
    useClaudeStore.setState({ usageOpen: true, costOpen: false })
    useClaudeStore.getState().usage()
    const state = useClaudeStore.getState()
    expect(state.usageOpen).toBe(false)
    expect(state.costOpen).toBe(false)
  })

  it('closing Cost leaves Usage as it was', () => {
    useClaudeStore.setState({ costOpen: true, usageOpen: false })
    useClaudeStore.getState().cost()
    const state = useClaudeStore.getState()
    expect(state.costOpen).toBe(false)
    expect(state.usageOpen).toBe(false)
  })
})

describe('claudeStore.setBusy', () => {
  beforeEach(() => {
    useClaudeStore.setState({ busyByInstance: {} })
  })

  it('tracks busy state per instance independently', () => {
    useClaudeStore.getState().setBusy('instance-a', true)
    expect(useClaudeStore.getState().busyByInstance).toEqual({ 'instance-a': true })

    useClaudeStore.getState().setBusy('instance-b', true)
    expect(useClaudeStore.getState().busyByInstance).toEqual({ 'instance-a': true, 'instance-b': true })

    useClaudeStore.getState().setBusy('instance-a', false)
    expect(useClaudeStore.getState().busyByInstance).toEqual({ 'instance-a': false, 'instance-b': true })
  })
})

describe('claudeStore.loadInstancesFromSession', () => {
  it('seeds a single fresh instance when nothing was saved', () => {
    useClaudeStore.getState().loadInstancesFromSession(undefined)
    const { instances, activeInstanceId } = useClaudeStore.getState()
    expect(instances).toHaveLength(1)
    expect(instances[0].hue).toBe('#D97757')
    expect(activeInstanceId).toBe(instances[0].id)
  })

  it('restores a saved instance list verbatim and activates the first one', () => {
    const saved = [{ id: 'a', kind: 'claude', hue: '#111111' }, { id: 'b', kind: 'claude', hue: '#222222' }]
    useClaudeStore.getState().loadInstancesFromSession({ agentSessions: saved })
    const state = useClaudeStore.getState()
    expect(state.instances).toEqual(saved)
    expect(state.activeInstanceId).toBe('a')
  })

  it('falls back to a fresh instance for an empty saved list', () => {
    useClaudeStore.getState().loadInstancesFromSession({ agentSessions: [] })
    expect(useClaudeStore.getState().instances).toHaveLength(1)
  })

  it('loads legacy claudeInstances as Claude sessions', () => {
    useClaudeStore.getState().loadInstancesFromSession({ claudeInstances: [{ id: 'old', hue: '#5B9BD5' }] })
    expect(useClaudeStore.getState().instances).toEqual([{ id: 'old', kind: 'claude', hue: '#5B9BD5' }])
  })

  it('prefers agentSessions over claudeInstances and opens Bridge conversations for bridge-like sessions', () => {
    useBridgeStore.setState({ conversations: {} })
    useClaudeStore.getState().loadInstancesFromSession({
      agentSessions: [{ id: 'c', kind: 'claude', hue: '#D97757' }, { id: 'l', kind: 'llama:q1', hue: '#5B9BD5' }],
      claudeInstances: [{ id: 'ignored', hue: '#000000' }],
    })
    expect(useClaudeStore.getState().instances.map((i) => i.id)).toEqual(['c', 'l'])
    expect(useBridgeStore.getState().conversations.l).toBeDefined()
    expect(useBridgeStore.getState().conversations.c).toBeUndefined()
  })

  it('drops malformed saved entries', () => {
    useClaudeStore.getState().loadInstancesFromSession({ agentSessions: [{ id: 'ok', kind: 'bridge', hue: '#fff' }, { id: 3 }, null] })
    expect(useClaudeStore.getState().instances.map((i) => i.id)).toEqual(['ok'])
  })
})

describe('claudeStore.newSession', () => {
  beforeEach(() => {
    useClaudeStore.getState().loadInstancesFromSession(undefined)
  })

  it('appends a new instance, assigns the next hue, and makes it active', () => {
    const firstId = useClaudeStore.getState().instances[0].id
    useClaudeStore.getState().newSession('/project', 'claude')

    const state = useClaudeStore.getState()
    expect(state.instances).toHaveLength(2)
    expect(state.instances[0].id).toBe(firstId)
    expect(state.instances[1].hue).not.toBe(state.instances[0].hue)
    expect(state.activeInstanceId).toBe(state.instances[1].id)
  })

  it('persists the new instance list', () => {
    useClaudeStore.getState().newSession('/project', 'claude')
    const saveMock = (window.api as any).sessionSave as ReturnType<typeof vi.fn>
    expect(saveMock).toHaveBeenCalledWith('/project', { agentSessions: useClaudeStore.getState().instances })
  })

  // VIDE-85: opening 3 sessions (orange, blue, purple), closing the orange
  // and purple ones, and keeping blue used to always hand the next session
  // the 2nd palette color regardless — which is blue, an exact clash with
  // the one instance still open. It should pick a color nothing open is
  // already using instead of just counting how many instances remain.
  it("picks a color no currently-open instance is using, not just the count-based slot", () => {
    useClaudeStore.getState().loadInstancesFromSession({ agentSessions: [
      { id: 'a', kind: 'claude', hue: '#D97757' }, // orange
      { id: 'b', kind: 'claude', hue: '#5B9BD5' }, // blue
      { id: 'c', kind: 'claude', hue: '#9B7ED9' }, // purple
    ] })
    useClaudeStore.getState().closeInstance('/project', 'a')
    useClaudeStore.getState().closeInstance('/project', 'c')
    expect(useClaudeStore.getState().instances).toHaveLength(1) // just blue left

    useClaudeStore.getState().newSession('/project', 'claude')

    const instances = useClaudeStore.getState().instances
    expect(instances).toHaveLength(2)
    expect(instances[1].hue).not.toBe('#5B9BD5')
  })
})

describe('claudeStore.closeInstance', () => {
  beforeEach(() => {
    useClaudeStore.getState().loadInstancesFromSession({ agentSessions: [
      { id: 'a', kind: 'claude', hue: '#111111' },
      { id: 'b', kind: 'claude', hue: '#222222' },
      { id: 'c', kind: 'claude', hue: '#333333' },
    ] })
    useClaudeStore.setState({ activeInstanceId: 'b' })
  })

  it('removes the instance and kills its PTY', () => {
    useClaudeStore.getState().closeInstance('/project', 'a')
    expect(useClaudeStore.getState().instances.map((i) => i.id)).toEqual(['b', 'c'])
    const killMock = (window.api as any).claudeKill as ReturnType<typeof vi.fn>
    expect(killMock).toHaveBeenCalledWith('a')
  })

  it('falls back active to the instance now at the same index when closing the active one', () => {
    useClaudeStore.getState().closeInstance('/project', 'b')
    const state = useClaudeStore.getState()
    expect(state.instances.map((i) => i.id)).toEqual(['a', 'c'])
    expect(state.activeInstanceId).toBe('c') // 'c' now sits at index 1, where 'b' was
  })

  it('falls back to the new last instance when closing the active last one', () => {
    useClaudeStore.setState({ activeInstanceId: 'c' })
    useClaudeStore.getState().closeInstance('/project', 'c')
    const state = useClaudeStore.getState()
    expect(state.instances.map((i) => i.id)).toEqual(['a', 'b'])
    expect(state.activeInstanceId).toBe('b')
  })

  it('closes Usage/Cost when closing hands the active slot to a non-Claude session', () => {
    useClaudeStore.getState().loadInstancesFromSession({ agentSessions: [
      { id: 'a', kind: 'claude', hue: '#111111' },
      { id: 'br', kind: 'bridge', hue: '#222222' },
    ] })
    useClaudeStore.setState({ activeInstanceId: 'a', usageOpen: true, costOpen: false })
    useClaudeStore.getState().closeInstance('/project', 'a')
    expect(useClaudeStore.getState().activeInstanceId).toBe('br')
    expect(useClaudeStore.getState().usageOpen).toBe(false)

    useClaudeStore.setState({ costOpen: true })
    useClaudeStore.getState().closeInstance('/project', 'br')
    expect(useClaudeStore.getState().activeInstanceId).toBe('')
    expect(useClaudeStore.getState().costOpen).toBe(false)
  })

  it('keeps Usage open when closing leaves a Claude session active', () => {
    useClaudeStore.setState({ usageOpen: true })
    useClaudeStore.getState().closeInstance('/project', 'b')
    expect(useClaudeStore.getState().usageOpen).toBe(true)
  })

  it('leaves activeInstanceId untouched when closing a non-active instance', () => {
    useClaudeStore.getState().closeInstance('/project', 'a')
    expect(useClaudeStore.getState().activeInstanceId).toBe('b')
  })

  // Closing the last remaining instance is allowed — the "+" button is the
  // way back in, same as before any session ever existed.
  it('closes the last remaining instance too, clearing activeInstanceId and collapsing the chat panel', () => {
    useClaudeStore.getState().closeInstance('/project', 'a')
    useClaudeStore.getState().closeInstance('/project', 'c')
    expect(useClaudeStore.getState().instances).toHaveLength(1)

    useClaudeStore.setState({ chatVisible: true })
    const killMock = (window.api as any).claudeKill as ReturnType<typeof vi.fn>
    killMock.mockClear()
    useClaudeStore.getState().closeInstance('/project', useClaudeStore.getState().instances[0].id)

    const state = useClaudeStore.getState()
    expect(state.instances).toHaveLength(0)
    expect(state.activeInstanceId).toBe('')
    expect(state.chatVisible).toBe(false)
    expect(killMock).toHaveBeenCalledWith('b')
  })

  it('leaves the chat panel alone when a close still leaves other instances open', () => {
    useClaudeStore.setState({ chatVisible: true })
    useClaudeStore.getState().closeInstance('/project', 'a')
    expect(useClaudeStore.getState().chatVisible).toBe(true)
  })
})

describe('claudeStore.closeAllInstances', () => {
  it('kills every instance, clears the list and active id, and collapses the chat panel', () => {
    useClaudeStore.getState().loadInstancesFromSession({ agentSessions: [
      { id: 'a', kind: 'claude', hue: '#111111' },
      { id: 'b', kind: 'claude', hue: '#222222' },
      { id: 'c', kind: 'claude', hue: '#333333' },
    ] })
    useClaudeStore.setState({ chatVisible: true })

    useClaudeStore.getState().closeAllInstances('/project')

    const state = useClaudeStore.getState()
    expect(state.instances).toHaveLength(0)
    expect(state.activeInstanceId).toBe('')
    expect(state.chatVisible).toBe(false)
    const killMock = (window.api as any).claudeKill as ReturnType<typeof vi.fn>
    expect(killMock).toHaveBeenCalledWith('a')
    expect(killMock).toHaveBeenCalledWith('b')
    expect(killMock).toHaveBeenCalledWith('c')
  })

  it('persists the now-empty instance list', () => {
    useClaudeStore.getState().loadInstancesFromSession({ agentSessions: [{ id: 'a', kind: 'claude', hue: '#111111' }] })
    useClaudeStore.getState().closeAllInstances('/project')
    const saveMock = (window.api as any).sessionSave as ReturnType<typeof vi.fn>
    expect(saveMock).toHaveBeenCalledWith('/project', { agentSessions: [] })
  })
})

describe('claudeStore.setActiveInstance', () => {
  it('switches the active instance id', () => {
    useClaudeStore.getState().loadInstancesFromSession({ agentSessions: [{ id: 'a', kind: 'claude', hue: '#111' }, { id: 'b', kind: 'claude', hue: '#222' }] })
    useClaudeStore.getState().setActiveInstance('b')
    expect(useClaudeStore.getState().activeInstanceId).toBe('b')
  })
})

describe('claudeStore session names', () => {
  beforeEach(() => {
    useClaudeStore.setState({
      instances: [{ id: 'a', kind: 'claude', hue: '#f00' }, { id: 'b', kind: 'claude', hue: '#0f0' }],
      activeInstanceId: 'a',
      titleByInstance: {},
    })
  })

  it('setTitle stores a cleaned live title per instance', () => {
    useClaudeStore.getState().setTitle('a', '✳ Fix redis')
    expect(useClaudeStore.getState().titleByInstance).toEqual({ a: 'Fix redis' })
  })

  it('renameInstance sets the name and persists it', () => {
    useClaudeStore.getState().renameInstance('/proj', 'b', '  Tests  ')
    const { instances } = useClaudeStore.getState()
    expect(instances[1]).toEqual({ id: 'b', kind: 'claude', hue: '#0f0', name: 'Tests' })
    expect(window.api.sessionSave).toHaveBeenCalledWith('/proj', { agentSessions: instances })
  })

  it('renaming to blank clears the custom name', () => {
    useClaudeStore.getState().renameInstance('/proj', 'a', 'Mine')
    useClaudeStore.getState().renameInstance('/proj', 'a', '   ')
    expect(useClaudeStore.getState().instances[0]).toEqual({ id: 'a', kind: 'claude', hue: '#f00' })
  })

  it('restores saved names from session data', () => {
    useClaudeStore.getState().loadInstancesFromSession({ agentSessions: [{ id: 'x', kind: 'claude', hue: '#00f', name: 'Kept' }] })
    expect(useClaudeStore.getState().instances[0].name).toBe('Kept')
  })
})

describe('claudeStore agent bar collapse', () => {
  it('toggles and persists the collapsed state to localStorage', () => {
    useClaudeStore.setState({ agentBarCollapsed: false })
    useClaudeStore.getState().toggleAgentBarCollapsed()
    expect(useClaudeStore.getState().agentBarCollapsed).toBe(true)
    expect(store['vide-agent-bar-collapsed']).toBe('1')

    useClaudeStore.getState().toggleAgentBarCollapsed()
    expect(useClaudeStore.getState().agentBarCollapsed).toBe(false)
    expect(store['vide-agent-bar-collapsed']).toBe('0')
  })
})

describe('claudeStore mixed sessions', () => {
  beforeEach(() => {
    useClaudeStore.setState({ instances: [], activeInstanceId: '', usageOpen: false, costOpen: false })
    useBridgeStore.setState({ conversations: {} })
  })

  it('newSession with a bridge-like kind opens a conversation and spawns no PTY', () => {
    useClaudeStore.getState().newSession('/p', 'bridge')
    const [inst] = useClaudeStore.getState().instances
    expect(inst.kind).toBe('bridge')
    expect(useBridgeStore.getState().conversations[inst.id]).toBeDefined()
    expect(window.api.claudeSpawn).not.toHaveBeenCalled()
  })

  it('every session gets the next free hue regardless of kind', () => {
    useClaudeStore.getState().newSession('/p', 'claude')
    useClaudeStore.getState().newSession('/p', 'llama:q1')
    const [a, b] = useClaudeStore.getState().instances
    expect(a.hue).not.toBe(b.hue)
  })

  it('closeInstance on a Bridge session closes its conversation instead of killing a PTY', () => {
    useClaudeStore.getState().newSession('/p', 'bridge')
    const id = useClaudeStore.getState().instances[0].id
    useClaudeStore.getState().closeInstance('/p', id)
    expect(useBridgeStore.getState().conversations[id]).toBeUndefined()
    expect(window.api.claudeKill).not.toHaveBeenCalled()
  })

  it('clearContext on a Bridge session clears that conversation; compact is a no-op', () => {
    useClaudeStore.getState().newSession('/p', 'bridge')
    const id = useClaudeStore.getState().instances[0].id
    useBridgeStore.getState().sendMessage(id, '/p', 'hi')
    useBridgeStore.getState().cancel(id)
    useClaudeStore.getState().compact()
    expect(window.api.claudeWrite).not.toHaveBeenCalled()
    useClaudeStore.getState().clearContext()
    expect(useBridgeStore.getState().conversations[id].messages).toEqual([])
  })

  it('usage/cost do nothing while the active session is not Claude', () => {
    useClaudeStore.getState().newSession('/p', 'bridge')
    useClaudeStore.getState().usage()
    useClaudeStore.getState().cost()
    expect(useClaudeStore.getState().usageOpen).toBe(false)
    expect(useClaudeStore.getState().costOpen).toBe(false)
  })

  it('setActiveInstance closes usage/cost when switching to a non-Claude session', () => {
    useClaudeStore.getState().newSession('/p', 'claude')
    const claudeId = useClaudeStore.getState().instances[0].id
    useClaudeStore.getState().usage()
    useClaudeStore.getState().newSession('/p', 'bridge')
    const bridgeId = useClaudeStore.getState().instances[1].id
    useClaudeStore.getState().setActiveInstance(claudeId)
    useClaudeStore.getState().usage()
    expect(useClaudeStore.getState().usageOpen).toBe(true)
    useClaudeStore.getState().setActiveInstance(bridgeId)
    expect(useClaudeStore.getState().usageOpen).toBe(false)
  })

  it('previousSession/resumeSession only act on Claude sessions', () => {
    useClaudeStore.getState().newSession('/p', 'bridge')
    useClaudeStore.getState().previousSession('/p')
    useClaudeStore.getState().resumeSession('/p')
    expect(window.api.claudeSpawn).not.toHaveBeenCalled()
  })
})

describe('claudeStore.moveInstance', () => {
  const ids = () => useClaudeStore.getState().instances.map((i) => i.id)
  beforeEach(() => {
    useClaudeStore.setState({
      instances: ['a', 'b', 'c', 'd'].map((id) => ({ id, kind: 'claude', hue: '#D97757' })),
      activeInstanceId: 'a',
    })
  })

  it('moves before a later target', () => {
    useClaudeStore.getState().moveInstance('/p', 'a', 'c', 'before')
    expect(ids()).toEqual(['b', 'a', 'c', 'd'])
  })

  it('moves after an earlier target', () => {
    useClaudeStore.getState().moveInstance('/p', 'd', 'a', 'after')
    expect(ids()).toEqual(['a', 'd', 'b', 'c'])
  })

  it('moves to the very end', () => {
    useClaudeStore.getState().moveInstance('/p', 'a', 'd', 'after')
    expect(ids()).toEqual(['b', 'c', 'd', 'a'])
  })

  it('is a no-op onto itself or an unknown id, and persists real moves', () => {
    useClaudeStore.getState().moveInstance('/p', 'b', 'b', 'before')
    useClaudeStore.getState().moveInstance('/p', 'zz', 'a', 'before')
    expect(ids()).toEqual(['a', 'b', 'c', 'd'])
    expect(window.api.sessionSave).not.toHaveBeenCalled()
    useClaudeStore.getState().moveInstance('/p', 'c', 'a', 'before')
    expect(window.api.sessionSave).toHaveBeenCalledWith('/p', { agentSessions: useClaudeStore.getState().instances })
  })
})
