import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createTerminalKeyHandler } from '../terminalKeys'
import { useClaudeStore } from '@/stores/claudeStore'
import { useInstanceFontSizeStore } from '@/stores/instanceFontSizeStore'

function keydown(key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) {
  return { type: 'keydown', key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn(), ...mods } as unknown as KeyboardEvent & {
    preventDefault: ReturnType<typeof vi.fn>
  }
}

function fakeXterm(selection: string) {
  return { hasSelection: () => selection.length > 0, getSelection: () => selection }
}

beforeEach(() => {
  useClaudeStore.setState({ pendingInjection: null, chatVisible: false, focusToken: 0 })
  useInstanceFontSizeStore.setState({ overrides: {} })
})

describe('createTerminalKeyHandler — Cmd+L', () => {
  it('sends the selection to the assistant, blocks the key, and stops xterm handling it', () => {
    const handler = createTerminalKeyHandler('t1', fakeXterm('npm ERR! boom'))
    const event = keydown('l', { metaKey: true })

    expect(handler(event)).toBe(false)
    expect(event.preventDefault).toHaveBeenCalled() // keeps the native "Show Claude Chat" menu accelerator from also firing
    expect(useClaudeStore.getState().pendingInjection).toBe('Terminal output:\n```\nnpm ERR! boom\n```')
    expect(useClaudeStore.getState().chatVisible).toBe(true)
  })

  it('also works with Ctrl+L and a capital L (caps lock)', () => {
    const handler = createTerminalKeyHandler('t1', fakeXterm('x'))
    expect(handler(keydown('L', { ctrlKey: true }))).toBe(false)
    expect(useClaudeStore.getState().pendingInjection).toBe('Terminal output:\n```\nx\n```')
  })

  it('with no selection, leaves the key alone so the existing "focus chat" menu action still runs', () => {
    const handler = createTerminalKeyHandler('t1', fakeXterm(''))
    const event = keydown('l', { metaKey: true })

    expect(handler(event)).toBe(true)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(useClaudeStore.getState().pendingInjection).toBeNull()
  })

  it('ignores L without a modifier and Cmd+Shift+L / Cmd+Alt+L', () => {
    const handler = createTerminalKeyHandler('t1', fakeXterm('selected'))
    expect(handler(keydown('l'))).toBe(true)
    expect(handler(keydown('l', { metaKey: true, shiftKey: true }))).toBe(true)
    expect(handler(keydown('l', { metaKey: true, altKey: true }))).toBe(true)
    expect(useClaudeStore.getState().pendingInjection).toBeNull()
  })

  it('ignores keyup events', () => {
    const handler = createTerminalKeyHandler('t1', fakeXterm('selected'))
    const event = { ...keydown('l', { metaKey: true }), type: 'keyup' } as unknown as KeyboardEvent
    expect(handler(event)).toBe(true)
    expect(useClaudeStore.getState().pendingInjection).toBeNull()
  })
})

describe('createTerminalKeyHandler — per-terminal zoom (unchanged behavior)', () => {
  it('Cmd+= / Cmd+- / Cmd+0 adjust and reset just this terminal, and are swallowed', () => {
    const handler = createTerminalKeyHandler('t1', fakeXterm(''))
    expect(handler(keydown('=', { metaKey: true }))).toBe(false)
    const raised = useInstanceFontSizeStore.getState().overrides['t1']
    expect(handler(keydown('-', { metaKey: true }))).toBe(false)
    expect(useInstanceFontSizeStore.getState().overrides['t1']).toBe(raised - 1)
    expect(handler(keydown('0', { metaKey: true }))).toBe(false)
    expect(useInstanceFontSizeStore.getState().overrides['t1']).toBeUndefined()
  })

  it('leaves shifted zoom variants and ordinary typing to pass through', () => {
    const handler = createTerminalKeyHandler('t1', fakeXterm(''))
    expect(handler(keydown('=', { metaKey: true, shiftKey: true }))).toBe(true)
    expect(handler(keydown('a'))).toBe(true)
    expect(useInstanceFontSizeStore.getState().overrides['t1']).toBeUndefined()
  })
})
