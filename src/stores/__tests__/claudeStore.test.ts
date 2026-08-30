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
    useClaudeStore.setState({ busyByAssistant: {} })
  })

  it('tracks busy state per assistant independently', () => {
    useClaudeStore.getState().setBusy('claude', true)
    expect(useClaudeStore.getState().busyByAssistant).toEqual({ claude: true })

    useClaudeStore.getState().setBusy('codex', true)
    expect(useClaudeStore.getState().busyByAssistant).toEqual({ claude: true, codex: true })

    useClaudeStore.getState().setBusy('claude', false)
    expect(useClaudeStore.getState().busyByAssistant).toEqual({ claude: false, codex: true })
  })
})
