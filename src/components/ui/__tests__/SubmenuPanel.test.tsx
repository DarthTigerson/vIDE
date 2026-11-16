import { describe, it, expect } from 'vitest'
import { placeSubmenu } from '../SubmenuPanel'

const viewport = { width: 1000, height: 800 }
const panel = { width: 200, height: 150 }

describe('placeSubmenu', () => {
  it('uses the preferred side when it fits', () => {
    expect(placeSubmenu({ top: 100, left: 100, right: 300 }, panel, viewport, 'right')).toEqual({ side: 'right', offsetY: 0 })
    expect(placeSubmenu({ top: 100, left: 500, right: 700 }, panel, viewport, 'left')).toEqual({ side: 'left', offsetY: 0 })
  })

  it('flips to the left when the right edge would cut it off', () => {
    expect(placeSubmenu({ top: 100, left: 600, right: 900 }, panel, viewport, 'right').side).toBe('left')
  })

  it('flips to the right when the left edge would cut it off', () => {
    expect(placeSubmenu({ top: 100, left: 50, right: 250 }, panel, viewport, 'left').side).toBe('right')
  })

  it('picks the roomier side when neither fits', () => {
    const narrow = { width: 400, height: 800 }
    const wide = { width: 300, height: 150 }
    // 176px of room on the left, 146px on the right.
    expect(placeSubmenu({ top: 0, left: 180, right: 250 }, wide, narrow, 'right').side).toBe('left')
    // 96px on the left, 196px on the right.
    expect(placeSubmenu({ top: 0, left: 100, right: 200 }, wide, narrow, 'left').side).toBe('right')
  })

  it('moves up just enough to clear the bottom edge', () => {
    expect(placeSubmenu({ top: 700, left: 100, right: 300 }, panel, viewport).offsetY).toBe(-54)
  })

  it('never moves above the top edge, even for a panel taller than the window', () => {
    const tall = { width: 200, height: 900 }
    expect(placeSubmenu({ top: 300, left: 100, right: 300 }, tall, viewport).offsetY).toBe(-296)
  })
})
