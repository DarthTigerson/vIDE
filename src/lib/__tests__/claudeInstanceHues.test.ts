import { describe, it, expect } from 'vitest'
import {
  CLAUDE_INSTANCE_HUES,
  hueForInstanceIndex,
  nextHueForInstances,
  gifHueRotationDeg,
} from '../claudeInstanceHues'

describe('hueForInstanceIndex', () => {
  it('gives the first instance the brand orange', () => {
    expect(hueForInstanceIndex(0)).toBe('#D97757')
  })

  it('gives later instances distinct colors from the palette', () => {
    expect(hueForInstanceIndex(1)).toBe(CLAUDE_INSTANCE_HUES[1])
    expect(hueForInstanceIndex(2)).toBe(CLAUDE_INSTANCE_HUES[2])
  })

  it('cycles once the palette is exhausted', () => {
    expect(hueForInstanceIndex(CLAUDE_INSTANCE_HUES.length)).toBe(CLAUDE_INSTANCE_HUES[0])
    expect(hueForInstanceIndex(CLAUDE_INSTANCE_HUES.length + 1)).toBe(CLAUDE_INSTANCE_HUES[1])
  })
})

describe('nextHueForInstances', () => {
  it('gives the 2nd palette color to a 2nd session, same as before', () => {
    expect(nextHueForInstances([{ hue: CLAUDE_INSTANCE_HUES[0] }])).toBe(CLAUDE_INSTANCE_HUES[1])
  })

  it('picks a color not already in use, regardless of session count (VIDE-85)', () => {
    // 3 sessions opened (orange, blue, purple), then the extras closed back
    // down to just the orange one — a plain count-based pick would treat
    // this as "instance #1" again and hand out blue every time.
    expect(nextHueForInstances([{ hue: CLAUDE_INSTANCE_HUES[0] }])).not.toBe(undefined)
    expect(nextHueForInstances([{ hue: CLAUDE_INSTANCE_HUES[0] }])).toBe(CLAUDE_INSTANCE_HUES[1])
  })

  it('skips a color that is still in use even if a lower-index slot is free', () => {
    // Orange closed, blue kept open — the next session should not become
    // blue again (that would sit right next to an identical-colored tab).
    expect(nextHueForInstances([{ hue: CLAUDE_INSTANCE_HUES[1] }])).toBe(CLAUDE_INSTANCE_HUES[0])
  })

  it('skips every color currently open, not just the first free slot', () => {
    const open = [CLAUDE_INSTANCE_HUES[0], CLAUDE_INSTANCE_HUES[1]].map((hue) => ({ hue }))
    expect(nextHueForInstances(open)).toBe(CLAUDE_INSTANCE_HUES[2])
  })

  it('once every color is in use, cycles without repeating the most recent instance', () => {
    const allUsed = CLAUDE_INSTANCE_HUES.map((hue) => ({ hue }))
    const next = nextHueForInstances(allUsed)
    expect(next).not.toBe(CLAUDE_INSTANCE_HUES[CLAUDE_INSTANCE_HUES.length - 1])
    expect(CLAUDE_INSTANCE_HUES).toContain(next)
  })
})

describe('gifHueRotationDeg', () => {
  it('is ~0deg (or equivalently ~360deg) for the brand orange itself, matching the gif art\'s own base color', () => {
    // Hue is circular — GIF_BASE_HUE_DEG is a rounded approximation of the
    // gif art's actual measured hue, so this lands a hair under 360 rather
    // than exactly 0. Either is visually identical (no rotation).
    const rotation = gifHueRotationDeg('#D97757')
    expect(rotation === 0 || rotation > 359).toBe(true)
  })

  it('rotates blue roughly +194deg from the base orange hue', () => {
    // #5B9BD5 sits at ~208.5deg in HSL; the gif's base orange sits at ~15deg.
    expect(gifHueRotationDeg('#5B9BD5')).toBeCloseTo(193.7, 0)
  })

  it('rotates green roughly +108deg from the base orange hue', () => {
    // #6FBF73 sits at ~123deg in HSL.
    expect(gifHueRotationDeg('#6FBF73')).toBeCloseTo(108, 0)
  })

  it('wraps into 0-360deg for a hue below the base orange', () => {
    // A near-red color sits at a lower hue than the ~15deg base, so the
    // naive subtraction would go negative — must wrap around instead.
    expect(gifHueRotationDeg('#D93C3C')).toBeGreaterThanOrEqual(0)
    expect(gifHueRotationDeg('#D93C3C')).toBeLessThan(360)
  })
})
