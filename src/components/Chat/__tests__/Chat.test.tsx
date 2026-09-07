import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, waitFor, act } from '@testing-library/react'
import { Chat } from '../Chat'
import { useFileStore } from '@/stores/fileStore'
import { useClaudeStore } from '@/stores/claudeStore'
import { SHIFT_ENTER_SEQUENCE } from '../shiftEnterSequence'
import { BRACKETED_PASTE_START, BRACKETED_PASTE_END } from '@/lib/sendSelectionToAssistant'
import { useInstanceFontSizeStore } from '@/stores/instanceFontSizeStore'
import { useFontSizeStore } from '@/stores/fontSizeStore'

beforeEach(() => {
  ;(global as any).window.api = {
    ...(global as any).window.api,
    assistantSpawn: vi.fn(),
    assistantWrite: vi.fn(),
    assistantResize: vi.fn(),
    onAssistantData: vi.fn(() => () => {}),
  }
  useFileStore.setState({ projectRoot: '/project' })
  useClaudeStore.setState({ assistant: 'claude', restartToken: 0, pendingInjection: null, focusToken: 0 })
  useInstanceFontSizeStore.getState().resetAll()
})

afterEach(() => {
  cleanup()
  useFileStore.setState({ projectRoot: null })
  useInstanceFontSizeStore.getState().resetAll()
})

describe('Chat (claude terminal)', () => {
  it('sends the ESC+CR sequence, not a plain CR, when Shift+Enter is pressed in the terminal', async () => {
    const { container } = render(<Chat />)

    const textarea = await waitFor(() => {
      const el = container.querySelector('.xterm-helper-textarea')
      if (!el) throw new Error('xterm helper textarea not mounted yet')
      return el as HTMLTextAreaElement
    })

    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })
    textarea.dispatchEvent(event)

    // Must be prevented: xterm's own _keyDown short-circuits before calling its
    // usual cancel()/preventDefault() once a custom handler returns false, so
    // without an explicit preventDefault() here the browser still inserts a
    // literal newline into xterm's textarea — which xterm's input handling then
    // forwards to the PTY as a stray extra keystroke, submitting anyway.
    expect(event.defaultPrevented).toBe(true)

    const writeMock = (window.api as any).assistantWrite as ReturnType<typeof vi.fn>
    expect(writeMock).toHaveBeenCalledWith('claude', SHIFT_ENTER_SEQUENCE)
    expect(writeMock).not.toHaveBeenCalledWith('claude', '\r')
    expect(writeMock).toHaveBeenCalledTimes(1)
  })

  it('lets plain Enter fall through to xterm instead of intercepting it', async () => {
    const { container } = render(<Chat />)

    const textarea = await waitFor(() => {
      const el = container.querySelector('.xterm-helper-textarea')
      if (!el) throw new Error('xterm helper textarea not mounted yet')
      return el as HTMLTextAreaElement
    })

    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false, bubbles: true, cancelable: true })
    textarea.dispatchEvent(event)

    // Our handler must not have called preventDefault/stopped this event — that's
    // how it signals xterm to fall back to its own default Enter handling.
    expect(event.defaultPrevented).toBe(false)
    const writeMock = (window.api as any).assistantWrite as ReturnType<typeof vi.fn>
    expect(writeMock).not.toHaveBeenCalledWith('claude', SHIFT_ENTER_SEQUENCE)
  })

  it('writes a bracketed-paste-wrapped injection to the active assistant and focuses the terminal', async () => {
    const { container } = render(<Chat />)
    await waitFor(() => {
      if (!container.querySelector('.xterm-helper-textarea')) throw new Error('xterm helper textarea not mounted yet')
    })

    act(() => {
      useClaudeStore.getState().sendSelection('In src/foo.ts (line 1):\n```ts\ncode\n```')
    })

    const writeMock = (window.api as any).assistantWrite as ReturnType<typeof vi.fn>
    expect(writeMock).toHaveBeenCalledWith(
      'claude',
      `${BRACKETED_PASTE_START}In src/foo.ts (line 1):\n\`\`\`ts\ncode\n\`\`\`${BRACKETED_PASTE_END}`
    )
    expect(useClaudeStore.getState().pendingInjection).toBeNull()
  })

  it('does not write anything for a bare focusChat() with no pending injection', async () => {
    const { container } = render(<Chat />)
    await waitFor(() => {
      if (!container.querySelector('.xterm-helper-textarea')) throw new Error('xterm helper textarea not mounted yet')
    })

    act(() => {
      useClaudeStore.getState().focusChat()
    })

    const writeMock = (window.api as any).assistantWrite as ReturnType<typeof vi.fn>
    expect(writeMock).not.toHaveBeenCalled()
  })

  it('zooms only the focused panel on unshifted CmdOrCtrl+=, leaving the global font size untouched', async () => {
    const { container } = render(<Chat />)
    const textarea = await waitFor(() => {
      const el = container.querySelector('.xterm-helper-textarea')
      if (!el) throw new Error('xterm helper textarea not mounted yet')
      return el as HTMLTextAreaElement
    })

    const globalSizeBefore = useFontSizeStore.getState().fontSize
    const event = new KeyboardEvent('keydown', { key: '=', metaKey: true, bubbles: true, cancelable: true })
    act(() => { textarea.dispatchEvent(event) })

    expect(useInstanceFontSizeStore.getState().overrides.claude).toBe(globalSizeBefore + 1)
    expect(useFontSizeStore.getState().fontSize).toBe(globalSizeBefore)
  })

  it('resets only the focused panel zoom on unshifted CmdOrCtrl+0', async () => {
    useInstanceFontSizeStore.setState({ overrides: { claude: 20 } })
    const { container } = render(<Chat />)
    const textarea = await waitFor(() => {
      const el = container.querySelector('.xterm-helper-textarea')
      if (!el) throw new Error('xterm helper textarea not mounted yet')
      return el as HTMLTextAreaElement
    })

    const event = new KeyboardEvent('keydown', { key: '0', metaKey: true, bubbles: true, cancelable: true })
    act(() => { textarea.dispatchEvent(event) })

    expect(useInstanceFontSizeStore.getState().overrides.claude).toBeUndefined()
  })

  it('lets shifted CmdOrCtrl+Shift+= (the global zoom shortcut) pass through unhandled', async () => {
    const { container } = render(<Chat />)
    const textarea = await waitFor(() => {
      const el = container.querySelector('.xterm-helper-textarea')
      if (!el) throw new Error('xterm helper textarea not mounted yet')
      return el as HTMLTextAreaElement
    })

    const event = new KeyboardEvent('keydown', { key: '+', metaKey: true, shiftKey: true, bubbles: true, cancelable: true })
    act(() => { textarea.dispatchEvent(event) })

    expect(event.defaultPrevented).toBe(false)
    expect(useInstanceFontSizeStore.getState().overrides.claude).toBeUndefined()
  })

  it('relays a resize to the PTY when the global font size changes, so the CLI redraws for its actual grid', async () => {
    const { container } = render(<Chat />)
    await waitFor(() => {
      if (!container.querySelector('.xterm-helper-textarea')) throw new Error('xterm helper textarea not mounted yet')
    })

    const resizeMock = (window.api as any).assistantResize as ReturnType<typeof vi.fn>
    resizeMock.mockClear()

    act(() => { useFontSizeStore.getState().decrease() })

    expect(resizeMock).toHaveBeenCalledWith('claude', expect.any(Number), expect.any(Number))
  })

  it('relays a resize to the PTY when a per-panel zoom override changes', async () => {
    const { container } = render(<Chat />)
    await waitFor(() => {
      if (!container.querySelector('.xterm-helper-textarea')) throw new Error('xterm helper textarea not mounted yet')
    })

    const resizeMock = (window.api as any).assistantResize as ReturnType<typeof vi.fn>
    resizeMock.mockClear()

    act(() => { useInstanceFontSizeStore.getState().decrease('claude') })

    expect(resizeMock).toHaveBeenCalledWith('claude', expect.any(Number), expect.any(Number))
  })
})
