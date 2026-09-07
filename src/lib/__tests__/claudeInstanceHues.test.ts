import { describe, it, expect } from 'vitest'
import { CLAUDE_INSTANCE_HUES, hueForInstanceIndex, gifHueRotationDeg } from '../claudeInstanceHues'

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
