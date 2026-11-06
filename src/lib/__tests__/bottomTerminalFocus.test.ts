// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { focusedBottomTerminalSide, BOTTOM_TERMINAL_SIDE_ATTR } from '../bottomTerminalFocus'

afterEach(() => { document.body.innerHTML = '' })

describe('focusedBottomTerminalSide', () => {
  it('finds the side that contains the focused element', () => {
    document.body.innerHTML = `<div ${BOTTOM_TERMINAL_SIDE_ATTR}="1"><div><textarea id="t"></textarea></div></div>`
    expect(focusedBottomTerminalSide(document.getElementById('t'))).toBe(1)
  })

  it('is null when focus is outside the bottom terminal', () => {
    document.body.innerHTML = `<div ${BOTTOM_TERMINAL_SIDE_ATTR}="0"></div><textarea id="editor"></textarea>`
    expect(focusedBottomTerminalSide(document.getElementById('editor'))).toBeNull()
    expect(focusedBottomTerminalSide(null)).toBeNull()
  })
})
