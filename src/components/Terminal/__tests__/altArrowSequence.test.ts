import { describe, it, expect } from 'vitest'
import { legacyAltArrowSequence } from '../altArrowSequence'

function key(key: string, mods: Partial<{ altKey: boolean; ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) {
  return { key, altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, ...mods }
}

describe('legacyAltArrowSequence', () => {
  it('maps Option+Left/Right to readline word movement on macOS', () => {
    expect(legacyAltArrowSequence(key('ArrowLeft', { altKey: true }), true)).toBe('\x1bb')
    expect(legacyAltArrowSequence(key('ArrowRight', { altKey: true }), true)).toBe('\x1bf')
  })

  it('leaves Option+Up/Down to xterm on macOS (5.x did not remap them there)', () => {
    expect(legacyAltArrowSequence(key('ArrowUp', { altKey: true }), true)).toBeUndefined()
    expect(legacyAltArrowSequence(key('ArrowDown', { altKey: true }), true)).toBeUndefined()
  })

  it('maps Alt+Arrow to the Ctrl+Arrow sequence elsewhere', () => {
    expect(legacyAltArrowSequence(key('ArrowLeft', { altKey: true }), false)).toBe('\x1b[1;5D')
    expect(legacyAltArrowSequence(key('ArrowRight', { altKey: true }), false)).toBe('\x1b[1;5C')
    expect(legacyAltArrowSequence(key('ArrowUp', { altKey: true }), false)).toBe('\x1b[1;5A')
    expect(legacyAltArrowSequence(key('ArrowDown', { altKey: true }), false)).toBe('\x1b[1;5B')
  })

  it('ignores arrows without Alt, with another modifier too, and non-arrow keys', () => {
    expect(legacyAltArrowSequence(key('ArrowLeft'), true)).toBeUndefined()
    expect(legacyAltArrowSequence(key('ArrowLeft', { altKey: true, shiftKey: true }), true)).toBeUndefined()
    expect(legacyAltArrowSequence(key('ArrowLeft', { altKey: true, ctrlKey: true }), false)).toBeUndefined()
    expect(legacyAltArrowSequence(key('ArrowLeft', { altKey: true, metaKey: true }), true)).toBeUndefined()
    expect(legacyAltArrowSequence(key('b', { altKey: true }), true)).toBeUndefined()
  })
})
