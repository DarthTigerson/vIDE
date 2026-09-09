import { describe, it, expect } from 'vitest'
import { formatRelativeTime } from '../formatRelativeTime'

const NOW = new Date('2026-09-08T12:00:00Z').getTime()

describe('formatRelativeTime', () => {
  it('returns "now" for under a minute', () => {
    expect(formatRelativeTime(NOW - 10_000, NOW)).toBe('now')
  })

  it('returns minutes under an hour', () => {
    expect(formatRelativeTime(NOW - 2 * 60_000, NOW)).toBe('2m')
    expect(formatRelativeTime(NOW - 59 * 60_000, NOW)).toBe('59m')
  })

  it('returns hours under a day', () => {
    expect(formatRelativeTime(NOW - 3 * 3_600_000, NOW)).toBe('3h')
  })

  it('returns "Yesterday" for one to two days ago', () => {
    expect(formatRelativeTime(NOW - 30 * 3_600_000, NOW)).toBe('Yesterday')
  })

  it('returns days for older timestamps', () => {
    expect(formatRelativeTime(NOW - 5 * 86_400_000, NOW)).toBe('5d')
  })
})
