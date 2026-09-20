import { describe, it, expect } from 'vitest'
import {
  toRelativePath,
  formatSelectionForAssistant,
  formatTerminalSelectionForAssistant,
  wrapBracketedPaste,
  BRACKETED_PASTE_START,
  BRACKETED_PASTE_END,
} from '../sendSelectionToAssistant'

describe('toRelativePath', () => {
  it('strips the project root prefix', () => {
    expect(toRelativePath('/Users/thomas/project/src/foo.ts', '/Users/thomas/project')).toBe('src/foo.ts')
  })

  it('handles a project root with a trailing slash', () => {
    expect(toRelativePath('/Users/thomas/project/src/foo.ts', '/Users/thomas/project/')).toBe('src/foo.ts')
  })

  it('falls back to the absolute path when it is outside the project root', () => {
    expect(toRelativePath('/etc/hosts', '/Users/thomas/project')).toBe('/etc/hosts')
  })

  it('falls back to the absolute path when there is no project root', () => {
    expect(toRelativePath('/Users/thomas/project/src/foo.ts', null)).toBe('/Users/thomas/project/src/foo.ts')
  })
})

describe('formatSelectionForAssistant', () => {
  it('formats a multi-line selection with a line range header', () => {
    const text = formatSelectionForAssistant({
      relPath: 'src/foo.ts',
      startLine: 10,
      endLine: 25,
      language: 'ts',
      code: 'function handleClick() {\n  doThing()\n}',
    })
    expect(text).toBe('In src/foo.ts (lines 10-25):\n```ts\nfunction handleClick() {\n  doThing()\n}\n```')
  })

  it('formats a single-line selection with a singular line header', () => {
    const text = formatSelectionForAssistant({
      relPath: 'src/foo.ts',
      startLine: 12,
      endLine: 12,
      language: 'ts',
      code: 'doThing()',
    })
    expect(text).toBe('In src/foo.ts (line 12):\n```ts\ndoThing()\n```')
  })
})

describe('wrapBracketedPaste', () => {
  it('wraps text in the bracketed-paste start/end escape sequences', () => {
    expect(wrapBracketedPaste('hello')).toBe(`${BRACKETED_PASTE_START}hello${BRACKETED_PASTE_END}`)
  })

  it('preserves legitimate newlines and tabs in the wrapped payload', () => {
    const wrapped = wrapBracketedPaste('line1\n\tline2')
    expect(wrapped).toBe(`${BRACKETED_PASTE_START}line1\n\tline2${BRACKETED_PASTE_END}`)
  })

  it('strips embedded control characters so an attacker-controlled selection cannot forge the end-of-paste sequence', () => {
    const malicious = `before${BRACKETED_PASTE_END}after`
    const wrapped = wrapBracketedPaste(malicious)
    const inner = wrapped.slice(BRACKETED_PASTE_START.length, -BRACKETED_PASTE_END.length)
    expect(inner).not.toContain('\x1b')
    expect(inner).toBe('before[201~after')
  })
})

describe('formatTerminalSelectionForAssistant', () => {
  it('labels the text as terminal output inside a plain code fence', () => {
    expect(formatTerminalSelectionForAssistant('npm ERR! code ELIFECYCLE\nnpm ERR! errno 1')).toBe(
      'Terminal output:\n```\nnpm ERR! code ELIFECYCLE\nnpm ERR! errno 1\n```'
    )
  })
})
