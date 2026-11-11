import { describe, it, expect, beforeEach } from 'vitest'
import { isLowRam, setCachedTotalBytes, LOW_RAM_BYTES } from '../lowRam'

describe('isLowRam', () => {
  beforeEach(() => setCachedTotalBytes(0))

  it('treats <=8GB as low RAM', () => {
    expect(isLowRam(8 * 1024 ** 3)).toBe(true)
    expect(isLowRam(4 * 1024 ** 3)).toBe(true)
  })

  it('treats more than 8GB as not low RAM', () => {
    expect(isLowRam(16 * 1024 ** 3)).toBe(false)
    expect(isLowRam(LOW_RAM_BYTES + 1)).toBe(false)
  })

  it('reads 0/unknown as not low RAM (default behavior unchanged)', () => {
    expect(isLowRam(0)).toBe(false)
    expect(isLowRam()).toBe(false)
  })

  it('falls back to the cached total when no argument is given', () => {
    setCachedTotalBytes(8 * 1024 ** 3)
    expect(isLowRam()).toBe(true)
    setCachedTotalBytes(32 * 1024 ** 3)
    expect(isLowRam()).toBe(false)
  })
})
