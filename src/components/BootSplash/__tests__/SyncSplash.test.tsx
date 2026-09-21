/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SyncSplash, SPLASH_SWAP_MS, swapHoldMs } from '../SyncSplash'
import { DEFAULT_SPLASH_PALETTE } from '@/lib/splashPalette'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const TEAL = { bg: '#0f1a1c', accent: '#2dd4bf', isLight: false }

describe('SyncSplash', () => {
  it('keeps the existing label', () => {
    render(<SyncSplash palette={DEFAULT_SPLASH_PALETTE} />)
    expect(screen.getByText('Syncing settings…')).toBeInTheDocument()
  })

  it('exposes the palette as CSS custom properties on the root', () => {
    render(<SyncSplash palette={TEAL} />)
    const root = screen.getByTestId('sync-splash')
    expect(root.style.getPropertyValue('--splash-bg')).toBe('#0f1a1c')
    expect(root.style.getPropertyValue('--splash-accent')).toBe('#2dd4bf')
  })

  it('updates the same element when the palette changes so CSS transitions can run', () => {
    const { rerender } = render(<SyncSplash palette={DEFAULT_SPLASH_PALETTE} />)
    const before = screen.getByTestId('sync-splash')
    rerender(<SyncSplash palette={TEAL} />)
    const after = screen.getByTestId('sync-splash')
    expect(after).toBe(before)
    expect(after.style.getPropertyValue('--splash-accent')).toBe('#2dd4bf')
  })

  it('tells the stylesheet whether the ground is light so the label stays readable', () => {
    const { rerender } = render(<SyncSplash palette={DEFAULT_SPLASH_PALETTE} />)
    expect(screen.getByTestId('sync-splash')).toHaveAttribute('data-tone', 'dark')
    rerender(<SyncSplash palette={{ bg: '#f5f5f3', accent: '#c4613d', isLight: true }} />)
    expect(screen.getByTestId('sync-splash')).toHaveAttribute('data-tone', 'light')
  })

  it('draws three pipes in from each side, each with a travelling pulse', () => {
    const { container } = render(<SyncSplash palette={DEFAULT_SPLASH_PALETTE} />)
    expect(container.querySelectorAll('.sync-splash__trace')).toHaveLength(6)
    expect(container.querySelectorAll('.sync-splash__pulse')).toHaveLength(6)
  })
})

describe('swapHoldMs', () => {
  const stubReducedMotion = (matches: boolean) =>
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: matches && q.includes('reduce') }))

  it('holds for the full swap so it is not cut off by the app mounting', () => {
    stubReducedMotion(false)
    expect(SPLASH_SWAP_MS).toBe(1300)
    expect(swapHoldMs()).toBe(SPLASH_SWAP_MS)
  })

  it('does not hold at all when the user prefers reduced motion', () => {
    stubReducedMotion(true)
    expect(swapHoldMs()).toBe(0)
  })
})
