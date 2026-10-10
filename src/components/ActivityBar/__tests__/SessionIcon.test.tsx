import { describe, it, expect, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { SessionIcon } from '../SessionIcon'
import { useBridgeStore } from '@/stores/bridgeStore'

beforeEach(() => {
  ;(window as any).api = { ...(window as any).api, bridgeSend: () => {}, onBridgeEvent: () => () => {} }
  useBridgeStore.setState({ conversations: {} })
})

describe('SessionIcon', () => {
  it('pulses a bridge-like session while it streams', () => {
    useBridgeStore.getState().openConversation('b1', false)
    const { container, rerender } = render(<SessionIcon session={{ id: 'b1', kind: 'bridge', hue: '#5B9BD5' }} />)
    expect(container.querySelector('.animate-pulse')).toBeNull()
    act(() => {
      useBridgeStore.setState((s) => ({ conversations: { b1: { ...s.conversations.b1, streaming: true } } }))
    })
    rerender(<SessionIcon session={{ id: 'b1', kind: 'bridge', hue: '#5B9BD5' }} />)
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })

  it('tints a llama session with its hue', () => {
    const { container } = render(<SessionIcon session={{ id: 'l1', kind: 'llama:q1', hue: '#5B9BD5' }} />)
    expect((container.firstChild as HTMLElement).style.color).toBe('rgb(91, 155, 213)')
  })
})
