// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { Terminal } from '@xterm/xterm'
import { PTY_XTERM_OPTIONS } from '../ptyXtermOptions'

function write(term: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => term.write(data, resolve))
}

function line(term: Terminal, y: number): string {
  return term.buffer.active.getLine(y)?.translateToString(true) ?? ''
}

describe('PTY_XTERM_OPTIONS', () => {
  it('keeps a bare LF as cursor-down so in-place redraws of wrapped input land in the right column', async () => {
    const term = new Terminal({ cols: 20, rows: 5, allowProposedApi: true, ...PTY_XTERM_OPTIONS })
    // What a line editor emits to move down one row while redrawing:
    // "\n" is terminfo cud1 for xterm and must not return to column 0.
    await write(term, 'abcd\nX')
    expect(line(term, 0)).toBe('abcd')
    expect(line(term, 1)).toBe('    X')
    term.dispose()
  })

  it('still renders ordinary PTY output, which arrives as CRLF', async () => {
    const term = new Terminal({ cols: 20, rows: 5, ...PTY_XTERM_OPTIONS })
    await write(term, 'one\r\ntwo')
    expect(line(term, 0)).toBe('one')
    expect(line(term, 1)).toBe('two')
    term.dispose()
  })
})
