import { describe, it, expect } from 'vitest'
import { CLAUDE_INSTANCE_HUES, hueForInstanceIndex } from '../claudeInstanceHues'

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
