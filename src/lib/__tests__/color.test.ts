import { describe, it, expect } from 'vitest'
import { hexToRgb, rgbToHex, hexToHsv, hsvToHex, isValidHex } from '../color'

describe('hexToRgb / rgbToHex', () => {
  it('round-trips pure red', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 })
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000')
  })

  it('round-trips an arbitrary colour, lowercased and zero-padded', () => {
    expect(hexToRgb('#1a2b3c')).toEqual({ r: 26, g: 43, b: 60 })
    expect(rgbToHex(26, 43, 60)).toBe('#1a2b3c')
    expect(rgbToHex(1, 2, 3)).toBe('#010203')
  })
})

describe('hexToHsv / hsvToHex', () => {
  it('converts pure red to hue 0, full saturation and value', () => {
    const { h, s, v } = hexToHsv('#ff0000')
    expect(h).toBe(0)
    expect(s).toBe(1)
    expect(v).toBe(1)
  })

  it('converts pure green to hue 120', () => {
    const { h, s, v } = hexToHsv('#00ff00')
    expect(h).toBe(120)
    expect(s).toBe(1)
    expect(v).toBe(1)
  })

  it('converts white to zero saturation, full value', () => {
    const { s, v } = hexToHsv('#ffffff')
    expect(s).toBe(0)
    expect(v).toBe(1)
  })

  it('converts black to zero value', () => {
    const { v } = hexToHsv('#000000')
    expect(v).toBe(0)
  })

  it('round-trips hue/saturation/value back to hex', () => {
    expect(hsvToHex(0, 1, 1)).toBe('#ff0000')
    expect(hsvToHex(120, 1, 1)).toBe('#00ff00')
    expect(hsvToHex(240, 1, 1)).toBe('#0000ff')
    expect(hsvToHex(0, 0, 1)).toBe('#ffffff')
    expect(hsvToHex(0, 0, 0)).toBe('#000000')
  })

  it('round-trips an arbitrary colour through hex -> hsv -> hex', () => {
    const { h, s, v } = hexToHsv('#c4613d')
    expect(hsvToHex(h, s, v)).toBe('#c4613d')
  })
})

describe('isValidHex', () => {
  it('accepts 6-digit hex with or without a leading #', () => {
    expect(isValidHex('#c4613d')).toBe(true)
    expect(isValidHex('#C4613D')).toBe(true)
  })

  it('rejects malformed values', () => {
    expect(isValidHex('#fff')).toBe(false)
    expect(isValidHex('c4613d')).toBe(false)
    expect(isValidHex('#gggggg')).toBe(false)
    expect(isValidHex('')).toBe(false)
  })
})
