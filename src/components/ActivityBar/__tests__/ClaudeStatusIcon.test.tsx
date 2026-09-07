import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { ClaudeStatusIcon } from '../ClaudeStatusIcon'
import { useClaudeStore } from '@/stores/claudeStore'
import { CLAUDE_WORKING_GIFS } from '@/assets/claudeGifs'
import { gifHueRotationDeg } from '@/lib/claudeInstanceHues'

const TEST_INSTANCE_ID = 'test-instance'

beforeEach(() => {
  useClaudeStore.setState({ busyByInstance: {} })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ClaudeStatusIcon', () => {
  it('renders the static Claude logo (no gif) when not busy', () => {
    const { container } = render(<ClaudeStatusIcon instanceId={TEST_INSTANCE_ID} color="#D97757" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('swaps to a randomly picked gif when busy, and back to the logo when idle', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { container } = render(<ClaudeStatusIcon instanceId={TEST_INSTANCE_ID} color="#D97757" />)

    act(() => useClaudeStore.getState().setBusy(TEST_INSTANCE_ID, true))
    expect(container.querySelector('svg')).toBeNull()
    expect(CLAUDE_WORKING_GIFS).toContain(container.querySelector('img')?.getAttribute('src'))

    act(() => useClaudeStore.getState().setBusy(TEST_INSTANCE_ID, false))
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('re-rolls the gif every minute while still busy', () => {
    vi.useFakeTimers()
    const randomSpy = vi.spyOn(Math, 'random')
    randomSpy.mockReturnValue(0) // picks the first gif

    const { container } = render(<ClaudeStatusIcon instanceId={TEST_INSTANCE_ID} color="#D97757" />)
    act(() => useClaudeStore.getState().setBusy(TEST_INSTANCE_ID, true))
    expect(container.querySelector('img')?.getAttribute('src')).toBe(CLAUDE_WORKING_GIFS[0])

    randomSpy.mockReturnValue(0.99) // last gif, for the next roll
    act(() => vi.advanceTimersByTime(60_000))
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      CLAUDE_WORKING_GIFS[CLAUDE_WORKING_GIFS.length - 1]
    )
  })

  it('does not track a different instance\'s busy state', () => {
    const { container } = render(<ClaudeStatusIcon instanceId={TEST_INSTANCE_ID} color="#D97757" />)
    act(() => useClaudeStore.getState().setBusy('other-instance', true))
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders the icon tinted with the given color when idle', () => {
    const { container } = render(<ClaudeStatusIcon instanceId={TEST_INSTANCE_ID} color="#5B9BD5" />)
    const path = container.querySelector('svg path')
    expect(path?.getAttribute('fill')).toBe('#5B9BD5')
  })

  it('tints the busy gif toward the given color via a hue-rotate filter, not left at the gif\'s own fixed orange', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { container } = render(<ClaudeStatusIcon instanceId={TEST_INSTANCE_ID} color="#5B9BD5" />)
    act(() => useClaudeStore.getState().setBusy(TEST_INSTANCE_ID, true))

    const img = container.querySelector('img')
    expect(img?.style.filter).toBe(`hue-rotate(${gifHueRotationDeg('#5B9BD5')}deg)`)
  })

  it('applies no meaningful rotation for the brand-orange instance, matching the gif art\'s own color', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const { container } = render(<ClaudeStatusIcon instanceId={TEST_INSTANCE_ID} color="#D97757" />)
    act(() => useClaudeStore.getState().setBusy(TEST_INSTANCE_ID, true))

    const img = container.querySelector('img')
    expect(img?.style.filter).toBe(`hue-rotate(${gifHueRotationDeg('#D97757')}deg)`)
  })
})
