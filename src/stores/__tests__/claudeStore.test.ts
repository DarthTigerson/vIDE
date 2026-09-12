import { describe, it, expect, beforeEach, vi } from 'vitest'

const { store } = vi.hoisted(() => {
  const store: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
  }
  return { store }
})

import { useClaudeStore } from '../claudeStore'

beforeEach(() => {
  if (!(global as any).window) {
    (global as any).window = {}
  }
  ;(global as any).window.api = {
    ...(((global as any).window as any).api ?? {}),
    claudeSpawn: vi.fn(),
    claudeWrite: vi.fn(),
    claudeKill: vi.fn(),
    sessionSave: vi.fn(),
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
    useClaudeStore.setState({ assistant: 'claude', usageOpen: false, costOpen: false })
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
    const saved = [{ id: 'a', hue: '#111111' }, { id: 'b', hue: '#222222' }]
    useClaudeStore.getState().loadInstancesFromSession(saved)
    const state = useClaudeStore.getState()
    expect(state.instances).toEqual(saved)
    expect(state.activeInstanceId).toBe('a')
  })

  it('falls back to a fresh instance for an empty saved list', () => {
    useClaudeStore.getState().loadInstancesFromSession([])
    expect(useClaudeStore.getState().instances).toHaveLength(1)
  })
})

describe('claudeStore.newSession', () => {
  beforeEach(() => {
    useClaudeStore.getState().loadInstancesFromSession(undefined)
  })

  it('appends a new instance, assigns the next hue, and makes it active', () => {
    const firstId = useClaudeStore.getState().instances[0].id
    useClaudeStore.getState().newSession('/project')

    const state = useClaudeStore.getState()
    expect(state.instances).toHaveLength(2)
    expect(state.instances[0].id).toBe(firstId)
    expect(state.instances[1].hue).not.toBe(state.instances[0].hue)
    expect(state.activeInstanceId).toBe(state.instances[1].id)
  })

  it('persists the new instance list', () => {
    useClaudeStore.getState().newSession('/project')
    const saveMock = (window.api as any).sessionSave as ReturnType<typeof vi.fn>
    expect(saveMock).toHaveBeenCalledWith('/project', { claudeInstances: useClaudeStore.getState().instances })
  })

  // VIDE-85: opening 3 sessions (orange, blue, purple), closing the orange
  // and purple ones, and keeping blue used to always hand the next session
  // the 2nd palette color regardless — which is blue, an exact clash with
  // the one instance still open. It should pick a color nothing open is
  // already using instead of just counting how many instances remain.
  it("picks a color no currently-open instance is using, not just the count-based slot", () => {
    useClaudeStore.getState().loadInstancesFromSession([
      { id: 'a', hue: '#D97757' }, // orange
      { id: 'b', hue: '#5B9BD5' }, // blue
      { id: 'c', hue: '#9B7ED9' }, // purple
    ])
    useClaudeStore.getState().closeInstance('/project', 'a')
    useClaudeStore.getState().closeInstance('/project', 'c')
    expect(useClaudeStore.getState().instances).toHaveLength(1) // just blue left

    useClaudeStore.getState().newSession('/project')

    const instances = useClaudeStore.getState().instances
    expect(instances).toHaveLength(2)
    expect(instances[1].hue).not.toBe('#5B9BD5')
  })
})

describe('claudeStore.closeInstance', () => {
  beforeEach(() => {
    useClaudeStore.getState().loadInstancesFromSession([
      { id: 'a', hue: '#111111' },
      { id: 'b', hue: '#222222' },
      { id: 'c', hue: '#333333' },
    ])
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

  it('leaves activeInstanceId untouched when closing a non-active instance', () => {
    useClaudeStore.getState().closeInstance('/project', 'a')
    expect(useClaudeStore.getState().activeInstanceId).toBe('b')
  })

  // Closing the last remaining instance is allowed — the "+" button is the
  // way back in, same as before any session ever existed.
  it('closes the last remaining instance too, clearing activeInstanceId', () => {
    useClaudeStore.getState().closeInstance('/project', 'a')
    useClaudeStore.getState().closeInstance('/project', 'c')
    expect(useClaudeStore.getState().instances).toHaveLength(1)

    const killMock = (window.api as any).claudeKill as ReturnType<typeof vi.fn>
    killMock.mockClear()
    useClaudeStore.getState().closeInstance('/project', useClaudeStore.getState().instances[0].id)

    const state = useClaudeStore.getState()
    expect(state.instances).toHaveLength(0)
    expect(state.activeInstanceId).toBe('')
    expect(killMock).toHaveBeenCalledWith('b')
  })
})

describe('claudeStore.closeAllInstances', () => {
  it('kills every instance and clears the list and active id', () => {
    useClaudeStore.getState().loadInstancesFromSession([
      { id: 'a', hue: '#111111' },
      { id: 'b', hue: '#222222' },
      { id: 'c', hue: '#333333' },
    ])

    useClaudeStore.getState().closeAllInstances('/project')

    const state = useClaudeStore.getState()
    expect(state.instances).toHaveLength(0)
    expect(state.activeInstanceId).toBe('')
    const killMock = (window.api as any).claudeKill as ReturnType<typeof vi.fn>
    expect(killMock).toHaveBeenCalledWith('a')
    expect(killMock).toHaveBeenCalledWith('b')
    expect(killMock).toHaveBeenCalledWith('c')
  })

  it('persists the now-empty instance list', () => {
    useClaudeStore.getState().loadInstancesFromSession([{ id: 'a', hue: '#111111' }])
    useClaudeStore.getState().closeAllInstances('/project')
    const saveMock = (window.api as any).sessionSave as ReturnType<typeof vi.fn>
    expect(saveMock).toHaveBeenCalledWith('/project', { claudeInstances: [] })
  })
})

describe('claudeStore.setActiveInstance', () => {
  it('switches the active instance id', () => {
    useClaudeStore.getState().loadInstancesFromSession([{ id: 'a', hue: '#111' }, { id: 'b', hue: '#222' }])
    useClaudeStore.getState().setActiveInstance('b')
    expect(useClaudeStore.getState().activeInstanceId).toBe('b')
  })
})
