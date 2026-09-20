import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { useHoldToShowShortcuts } from '../useHoldToShowShortcuts'
import { useSearchStore } from '@/stores/searchStore'

function keydown(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, metaKey: key === 'Meta', bubbles: true }))
}

function keyup(key: string) {
  window.dispatchEvent(new KeyboardEvent('keyup', { key, metaKey: false, bubbles: true }))
}

function tripleTap(msBetween = 100) {
  const now = Date.now()
  vi.setSystemTime(now)
  keydown('Meta')
  keyup('Meta')
  vi.setSystemTime(now + msBetween)
  keydown('Meta')
  keyup('Meta')
  vi.setSystemTime(now + msBetween * 2)
  keydown('Meta')
}

describe('useHoldToShowShortcuts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useSearchStore.setState({
      commandPaletteOpen: false,
      actionPaletteOpen: false,
      shortcutsOverlayOpen: false,
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('opens the overlay on triple-tap of Meta within 300ms per gap', () => {
    renderHook(() => useHoldToShowShortcuts())

    act(() => { tripleTap(100) })

    expect(useSearchStore.getState().shortcutsOverlayOpen).toBe(true)
  })

  it('does not open on a single Meta press', () => {
    renderHook(() => useHoldToShowShortcuts())

    act(() => { keydown('Meta'); keyup('Meta') })

    expect(useSearchStore.getState().shortcutsOverlayOpen).toBe(false)
  })

  it('does not open on a double-tap alone', () => {
    renderHook(() => useHoldToShowShortcuts())

    const now = Date.now()
    vi.setSystemTime(now)
    act(() => {
      keydown('Meta')
      keyup('Meta')
      vi.setSystemTime(now + 100)
      keydown('Meta')
    })

    expect(useSearchStore.getState().shortcutsOverlayOpen).toBe(false)
  })

  it('does not open when a gap between taps exceeds 300ms', () => {
    renderHook(() => useHoldToShowShortcuts())

    const now = Date.now()
    vi.setSystemTime(now)
    act(() => {
      keydown('Meta')
      keyup('Meta')
      vi.setSystemTime(now + 301)
      keydown('Meta')
      keyup('Meta')
      vi.setSystemTime(now + 401)
      keydown('Meta')
    })

    expect(useSearchStore.getState().shortcutsOverlayOpen).toBe(false)
  })

  it('toggles the overlay closed on a second triple-tap', () => {
    renderHook(() => useHoldToShowShortcuts())

    act(() => { tripleTap(100) })
    expect(useSearchStore.getState().shortcutsOverlayOpen).toBe(true)

    // Advance past the tap window so the second sequence starts fresh
    act(() => {
      vi.setSystemTime(Date.now() + 400)
      tripleTap(100)
    })
    expect(useSearchStore.getState().shortcutsOverlayOpen).toBe(false)
  })

  it('closes the overlay when a non-modifier key is pressed', () => {
    renderHook(() => useHoldToShowShortcuts())

    act(() => { tripleTap(100) })
    expect(useSearchStore.getState().shortcutsOverlayOpen).toBe(true)

    act(() => { keydown('t') })
    expect(useSearchStore.getState().shortcutsOverlayOpen).toBe(false)
  })

  it('closes the overlay when Escape is pressed', () => {
    renderHook(() => useHoldToShowShortcuts())

    act(() => { tripleTap(100) })
    expect(useSearchStore.getState().shortcutsOverlayOpen).toBe(true)

    act(() => { keydown('Escape') })
    expect(useSearchStore.getState().shortcutsOverlayOpen).toBe(false)
  })

  it('closes the overlay on window blur', () => {
    renderHook(() => useHoldToShowShortcuts())

    act(() => { tripleTap(100) })
    expect(useSearchStore.getState().shortcutsOverlayOpen).toBe(true)

    act(() => { window.dispatchEvent(new Event('blur')) })
    expect(useSearchStore.getState().shortcutsOverlayOpen).toBe(false)
  })

  it('does not open while the command palette is already open', () => {
    useSearchStore.setState({ commandPaletteOpen: true })
    renderHook(() => useHoldToShowShortcuts())

    act(() => { tripleTap(100) })

    expect(useSearchStore.getState().shortcutsOverlayOpen).toBe(false)
  })

  it('overlay stays open after releasing Meta', () => {
    renderHook(() => useHoldToShowShortcuts())

    act(() => { tripleTap(100) })
    expect(useSearchStore.getState().shortcutsOverlayOpen).toBe(true)

    act(() => { keyup('Meta') })
    expect(useSearchStore.getState().shortcutsOverlayOpen).toBe(true)
  })

  it('cancels the tap sequence if a non-modifier key is pressed between taps', () => {
    renderHook(() => useHoldToShowShortcuts())

    act(() => {
      keydown('Meta')
      keyup('Meta')
      keydown('t')   // interrupts the sequence
      keydown('Meta') // second tap, but sequence was cancelled
      keyup('Meta')
      keydown('Meta') // would-be third tap of the original sequence
    })

    expect(useSearchStore.getState().shortcutsOverlayOpen).toBe(false)
  })
})
