import { describe, it, expect } from 'vitest'
import { cleanSessionTitle, sessionDisplayName } from '../claudeSessionName'

describe('cleanSessionTitle', () => {
  it('strips Claude Code\'s idle ✳ marker', () => {
    expect(cleanSessionTitle('✳ Fix redis cache key')).toBe('Fix redis cache key')
  })

  it('strips braille spinner frames shown while busy', () => {
    expect(cleanSessionTitle('⠐ Fix redis cache key')).toBe('Fix redis cache key')
    expect(cleanSessionTitle('⠂  Write tests')).toBe('Write tests')
  })

  it('leaves a plain title alone', () => {
    expect(cleanSessionTitle('Refactor UI')).toBe('Refactor UI')
  })

  it('returns empty for a glyph-only or blank title', () => {
    expect(cleanSessionTitle('✳')).toBe('')
    expect(cleanSessionTitle('   ')).toBe('')
  })
})

describe('sessionDisplayName', () => {
  it('prefers a custom name over the live title', () => {
    expect(sessionDisplayName({ name: 'Mine' }, 'Live', 0)).toBe('Mine')
  })

  it('falls back to the live title', () => {
    expect(sessionDisplayName({}, 'Live', 0)).toBe('Live')
  })

  it('falls back to Session N (1-based)', () => {
    expect(sessionDisplayName({}, undefined, 2)).toBe('Session 3')
    expect(sessionDisplayName({ name: '' }, '', 0)).toBe('Session 1')
  })
})
