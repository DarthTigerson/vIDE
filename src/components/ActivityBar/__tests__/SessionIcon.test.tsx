import { describe, it, expect, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { SessionIcon } from '../SessionIcon'
import { useBridgeStore } from '@/stores/bridgeStore'
import { useClaudeStore } from '@/stores/claudeStore'
import { ROCKY_WORKING_GIFS } from '@/assets/rockyGifs'
import { CLAUDE_WORKING_GIFS } from '@/assets/claudeGifs'

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

  it('shows the Rocky icon for a Bridge or llama session in Rocky mode', () => {
    const { container, rerender } = render(<SessionIcon session={{ id: 'l1', kind: 'llama:q1', hue: '#5B9BD5', rocky: true }} />)
    expect(container.querySelector('img')).not.toBeNull()
    rerender(<SessionIcon session={{ id: 'l1', kind: 'llama:q1', hue: '#5B9BD5' }} />)
    expect(container.querySelector('img')).toBeNull()
  })

  it('swaps a busy Rocky session to one of Rocky\'s own working gifs', () => {
    const session = { id: 'r1', kind: 'rocky', hue: '#D97757' }
    const { container } = render(<SessionIcon session={session} />)
    expect(container.querySelector('img')?.getAttribute('src')).not.toBeNull() // idle Rocky icon
    expect(ROCKY_WORKING_GIFS).not.toContain(container.querySelector('img')?.getAttribute('src'))
    act(() => useClaudeStore.setState({ busyByInstance: { r1: true } }))
    const src = container.querySelector('img')?.getAttribute('src')
    expect(ROCKY_WORKING_GIFS).toContain(src)
    expect(CLAUDE_WORKING_GIFS).not.toContain(src)
  })
})
