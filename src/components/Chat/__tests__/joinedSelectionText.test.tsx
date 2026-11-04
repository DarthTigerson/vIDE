import { describe, it, expect } from 'vitest'
import { Terminal as XTerm } from '@xterm/xterm'
import { joinedSelectionText } from '../terminalLinks'

async function terminalWith(rows: string[]): Promise<XTerm> {
  const terminal = new XTerm({ cols: 80, rows: 10 })
  const host = document.createElement('div')
  document.body.appendChild(host)
  terminal.open(host)
  await new Promise<void>((resolve) => terminal.write(rows.join('\r\n'), resolve))
  return terminal
}

describe('joinedSelectionText', () => {
  const path = '/Users/keithfenech/Documents/vSuite/vIDE/graphify-out/cache/ast/v0.9.50-s2/fa2ace9e7aa6e01e3e0f9b77f878e01eca7e46b6e60c0a34de806d7d7fae86ef.json'

  it('copies a path Claude Code wrapped across rows as one line', async () => {
    // First row ends at column 75 of 80, short of the edge like Claude's own margin.
    const terminal = await terminalWith(['  ' + path.slice(0, 73), '  ' + path.slice(73)])
    terminal.selectLines(0, 1)
    expect(joinedSelectionText(terminal)).toBe('  ' + path)
  })

  it('keeps the line breaks of ordinary prose', async () => {
    const terminal = await terminalWith(['  The correct absolute form, for comparison when you test it out today:', '  done'])
    terminal.selectLines(0, 1)
    expect(joinedSelectionText(terminal)).toBe('  The correct absolute form, for comparison when you test it out today:\n  done')
  })

  it('copies a partial selection inside the wrapped path', async () => {
    const terminal = await terminalWith(['  ' + path.slice(0, 73), '  ' + path.slice(73)])
    // From "/Users" on row 0 to the end of row 1's text.
    terminal.select(2, 0, 80 + 2 + (path.length - 73))
    expect(joinedSelectionText(terminal)).toBe(path)
  })
})
