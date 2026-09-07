import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { ClaudeStatusIcon } from '../ClaudeStatusIcon'
import { useClaudeStore } from '@/stores/claudeStore'
import { CLAUDE_WORKING_GIFS } from '@/assets/claudeGifs'

beforeEach(() => {
  useClaudeStore.setState({ busyByAssistant: {} })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ClaudeStatusIcon', () => {
  it('renders the static Claude logo (no gif) when not busy', () => {
    const { container } = render(<ClaudeStatusIcon />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('swaps to a randomly picked gif when busy, and back to the logo when idle', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { container } = render(<ClaudeStatusIcon />)

    act(() => useClaudeStore.getState().setBusy('claude', true))
    expect(container.querySelector('svg')).toBeNull()
    expect(CLAUDE_WORKING_GIFS).toContain(container.querySelector('img')?.getAttribute('src'))

    act(() => useClaudeStore.getState().setBusy('claude', false))
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('re-rolls the gif every minute while still busy', () => {
    vi.useFakeTimers()
    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValue(0) // picks the first gif

    const { container } = render(<ClaudeStatusIcon />)
    act(() => useClaudeStore.getState().setBusy('claude', true))
    expect(container.querySelector('img')?.getAttribute('src')).toBe(CLAUDE_WORKING_GIFS[0])

    randomSpy.mockReturnValue(0.99) // last gif, for the next roll
    act(() => vi.advanceTimersByTime(60_000))
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      CLAUDE_WORKING_GIFS[CLAUDE_WORKING_GIFS.length - 1]
    )
  })

  it('does not track other assistants\' busy state', () => {
    const { container } = render(<ClaudeStatusIcon />)
    act(() => useClaudeStore.getState().setBusy('bridge', true))
    expect(container.querySelector('img')).toBeNull()
  })
})
