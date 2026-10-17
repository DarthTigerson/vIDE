import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useBridgeAgentModeShortcut } from '../useBridgeAgentModeShortcut'
import { useBridgeStore } from '@/stores/bridgeStore'
import { useClaudeStore } from '@/stores/claudeStore'

beforeEach(() => {
  useBridgeStore.setState({ conversations: {} })
  useBridgeStore.getState().openConversation('s1', false)
  useClaudeStore.setState({ instances: [{ id: 's1', kind: 'bridge', hue: '#D97757' }], activeInstanceId: 's1', chatVisible: true })
})

describe('useBridgeAgentModeShortcut', () => {
  it('toggles agentMode on Shift+Tab when the Bridge panel is visible', () => {
    renderHook(() => useBridgeAgentModeShortcut('s1'))

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true })
    window.dispatchEvent(event)

    expect(useBridgeStore.getState().conversations.s1.agentMode).toBe(true)
  })

  it('prevents the default Tab focus-move behavior', () => {
    renderHook(() => useBridgeAgentModeShortcut('s1'))

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true })
    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('does not toggle on plain Tab (no shift)', () => {
    renderHook(() => useBridgeAgentModeShortcut('s1'))

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: false }))

    expect(useBridgeStore.getState().conversations.s1.agentMode).toBe(false)
  })

  it('removes the listener on unmount', () => {
    const { unmount } = renderHook(() => useBridgeAgentModeShortcut('s1'))
    unmount()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }))

    expect(useBridgeStore.getState().conversations.s1.agentMode).toBe(false)
  })

  it('does not toggle when the chat panel is collapsed (chatVisible false)', () => {
    useClaudeStore.setState({ chatVisible: false })
    renderHook(() => useBridgeAgentModeShortcut('s1'))

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }))

    expect(useBridgeStore.getState().conversations.s1.agentMode).toBe(false)
  })

  it('does not toggle when a different session is active', () => {
    useClaudeStore.setState({ activeInstanceId: 'other' })
    renderHook(() => useBridgeAgentModeShortcut('s1'))

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }))

    expect(useBridgeStore.getState().conversations.s1.agentMode).toBe(false)
  })

  it('works for llama sessions too', () => {
    useClaudeStore.setState({ instances: [{ id: 's1', kind: 'llama:q1', hue: '#D97757' }] })
    renderHook(() => useBridgeAgentModeShortcut('s1'))

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }))

    expect(useBridgeStore.getState().conversations.s1.agentMode).toBe(true)
  })

  it('re-arms the listener once visibility is restored', () => {
    useClaudeStore.setState({ chatVisible: false })
    const { rerender } = renderHook(() => useBridgeAgentModeShortcut('s1'))

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }))
    expect(useBridgeStore.getState().conversations.s1.agentMode).toBe(false)

    act(() => {
      useClaudeStore.setState({ chatVisible: true })
    })
    rerender()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }))
    expect(useBridgeStore.getState().conversations.s1.agentMode).toBe(true)
  })
})
