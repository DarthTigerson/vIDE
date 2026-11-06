// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { focusedBottomTerminalSide, focusedAgentTerminalSession, focusAfterTerminalClose, BOTTOM_TERMINAL_SIDE_ATTR, AGENT_TERMINAL_SESSION_ATTR } from '../bottomTerminalFocus'

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

describe('focusAfterTerminalClose', () => {
  const flushFrames = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))))

  it('focuses the next terminal when one is left', async () => {
    const focusTerminal = vi.fn()
    focusAfterTerminalClose({ nextTerminalId: () => 'b', focusTerminal, activePaneId: () => 'pane-1' })
    await flushFrames()
    expect(focusTerminal).toHaveBeenCalledWith('b')
  })

  it('falls back to the active editor pane when no terminal is left', async () => {
    document.body.innerHTML = `<div data-pane-id="pane-2"><textarea id="monaco"></textarea></div>`
    const focusTerminal = vi.fn()
    focusAfterTerminalClose({ nextTerminalId: () => null, focusTerminal, activePaneId: () => 'pane-2' })
    await flushFrames()
    expect(focusTerminal).not.toHaveBeenCalled()
    expect(document.activeElement?.id).toBe('monaco')
  })
})

describe('focusedAgentTerminalSession', () => {
  it('returns the terminal session holding focus', () => {
    document.body.innerHTML = `<div ${AGENT_TERMINAL_SESSION_ATTR}="term-3"><textarea id="t"></textarea></div>`
    expect(focusedAgentTerminalSession(document.getElementById('t'))).toBe('term-3')
  })

  it('is null for an unmarked (Claude) session or no focus', () => {
    document.body.innerHTML = `<div><textarea id="claude"></textarea></div>`
    expect(focusedAgentTerminalSession(document.getElementById('claude'))).toBeNull()
    expect(focusedAgentTerminalSession(null)).toBeNull()
  })
})
