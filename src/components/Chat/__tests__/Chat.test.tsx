import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, waitFor, act } from '@testing-library/react'
import { Chat } from '../Chat'
import { useFileStore } from '@/stores/fileStore'
import { useClaudeStore } from '@/stores/claudeStore'
import { SHIFT_ENTER_SEQUENCE } from '../shiftEnterSequence'
import { BRACKETED_PASTE_START, BRACKETED_PASTE_END } from '@/lib/sendSelectionToAssistant'
import { useInstanceFontSizeStore } from '@/stores/instanceFontSizeStore'
import { useFontSizeStore } from '@/stores/fontSizeStore'

const TEST_INSTANCE_ID = 'test-instance-1'

beforeEach(() => {
  ;(global as any).window.api = {
    ...(global as any).window.api,
    claudeSpawn: vi.fn(),
    claudeWrite: vi.fn(),
    claudeResize: vi.fn(),
    claudeKill: vi.fn(),
    onClaudeData: vi.fn(() => () => {}),
  }
  useFileStore.setState({ projectRoot: '/project' })
  useClaudeStore.setState({
    assistant: 'claude',
    instances: [{ id: TEST_INSTANCE_ID, hue: '#D97757' }],
    activeInstanceId: TEST_INSTANCE_ID,
    restartToken: 0,
    pendingInjection: null,
    focusToken: 0,
  })
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

    const writeMock = (window.api as any).claudeWrite as ReturnType<typeof vi.fn>
    expect(writeMock).toHaveBeenCalledWith(TEST_INSTANCE_ID, SHIFT_ENTER_SEQUENCE)
    expect(writeMock).not.toHaveBeenCalledWith(TEST_INSTANCE_ID, '\r')
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
    const writeMock = (window.api as any).claudeWrite as ReturnType<typeof vi.fn>
    expect(writeMock).not.toHaveBeenCalledWith(TEST_INSTANCE_ID, SHIFT_ENTER_SEQUENCE)
  })

  it('writes a bracketed-paste-wrapped injection to the active assistant and focuses the terminal', async () => {
    const { container } = render(<Chat />)
    await waitFor(() => {
      if (!container.querySelector('.xterm-helper-textarea')) throw new Error('xterm helper textarea not mounted yet')
    })

    act(() => {
      useClaudeStore.getState().sendSelection('In src/foo.ts (line 1):\n```ts\ncode\n```')
    })

    const writeMock = (window.api as any).claudeWrite as ReturnType<typeof vi.fn>
    expect(writeMock).toHaveBeenCalledWith(
      TEST_INSTANCE_ID,
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

    const writeMock = (window.api as any).claudeWrite as ReturnType<typeof vi.fn>
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

    expect(useInstanceFontSizeStore.getState().overrides[TEST_INSTANCE_ID]).toBe(globalSizeBefore + 1)
    expect(useFontSizeStore.getState().fontSize).toBe(globalSizeBefore)
  })

  it('resets only the focused panel zoom on unshifted CmdOrCtrl+0', async () => {
    useInstanceFontSizeStore.setState({ overrides: { [TEST_INSTANCE_ID]: 20 } })
    const { container } = render(<Chat />)
    const textarea = await waitFor(() => {
      const el = container.querySelector('.xterm-helper-textarea')
      if (!el) throw new Error('xterm helper textarea not mounted yet')
      return el as HTMLTextAreaElement
    })

    const event = new KeyboardEvent('keydown', { key: '0', metaKey: true, bubbles: true, cancelable: true })
    act(() => { textarea.dispatchEvent(event) })

    expect(useInstanceFontSizeStore.getState().overrides[TEST_INSTANCE_ID]).toBeUndefined()
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
    expect(useInstanceFontSizeStore.getState().overrides[TEST_INSTANCE_ID]).toBeUndefined()
  })

  it('relays a resize to the PTY when the global font size changes, so the CLI redraws for its actual grid', async () => {
    const { container } = render(<Chat />)
    await waitFor(() => {
      if (!container.querySelector('.xterm-helper-textarea')) throw new Error('xterm helper textarea not mounted yet')
    })

    const resizeMock = (window.api as any).claudeResize as ReturnType<typeof vi.fn>
    resizeMock.mockClear()

    act(() => { useFontSizeStore.getState().decrease() })

    expect(resizeMock).toHaveBeenCalledWith(TEST_INSTANCE_ID, expect.any(Number), expect.any(Number))
  })

  it('relays a resize to the PTY when a per-panel zoom override changes', async () => {
    const { container } = render(<Chat />)
    await waitFor(() => {
      if (!container.querySelector('.xterm-helper-textarea')) throw new Error('xterm helper textarea not mounted yet')
    })

    const resizeMock = (window.api as any).claudeResize as ReturnType<typeof vi.fn>
    resizeMock.mockClear()

    act(() => { useInstanceFontSizeStore.getState().decrease(TEST_INSTANCE_ID) })

    expect(resizeMock).toHaveBeenCalledWith(TEST_INSTANCE_ID, expect.any(Number), expect.any(Number))
  })

  it('mounts and spawns a terminal for every instance in the list, not just the active one', async () => {
    const secondId = 'test-instance-2'
    useClaudeStore.setState({
      instances: [
        { id: TEST_INSTANCE_ID, hue: '#D97757' },
        { id: secondId, hue: '#5B9BD5' },
      ],
      activeInstanceId: TEST_INSTANCE_ID,
    })
    render(<Chat />)
    const spawnMock = (window.api as any).claudeSpawn as ReturnType<typeof vi.fn>
    await waitFor(() => {
      expect(spawnMock).toHaveBeenCalledWith('/project', TEST_INSTANCE_ID)
      expect(spawnMock).toHaveBeenCalledWith('/project', secondId)
    })
  })

  it('switches the visible terminal when activeInstanceId changes, without cross-writing to the inactive one', async () => {
    const secondId = 'test-instance-2'
    useClaudeStore.setState({
      instances: [
        { id: TEST_INSTANCE_ID, hue: '#D97757' },
        { id: secondId, hue: '#5B9BD5' },
      ],
      activeInstanceId: secondId,
    })
    const { container } = render(<Chat />)
    await waitFor(() => {
      if (!container.querySelector('.xterm-helper-textarea')) throw new Error('xterm helper textarea not mounted yet')
    })

    act(() => {
      useClaudeStore.getState().sendSelection('hello')
    })

    const writeMock = (window.api as any).claudeWrite as ReturnType<typeof vi.fn>
    expect(writeMock).toHaveBeenCalledWith(secondId, expect.stringContaining('hello'))
    expect(writeMock).not.toHaveBeenCalledWith(TEST_INSTANCE_ID, expect.anything())
  })

  it('tears down a terminal when its instance is removed from the list, and does not leave it covering the active one', async () => {
    const secondId = 'test-instance-2'
    useClaudeStore.setState({
      instances: [
        { id: TEST_INSTANCE_ID, hue: '#D97757' },
        { id: secondId, hue: '#5B9BD5' },
      ],
      activeInstanceId: TEST_INSTANCE_ID,
    })
    const { container } = render(<Chat />)
    const killMock = (window.api as any).claudeKill as ReturnType<typeof vi.fn>
    await waitFor(() => {
      // both terminals mounted (2 xterm helper textareas)
      expect(container.querySelectorAll('.xterm-helper-textarea').length).toBe(2)
    })

    // Close the ACTIVE instance and switch to the remaining one, exactly as
    // claudeStore.closeInstance() does in one atomic update.
    act(() => {
      useClaudeStore.setState({
        instances: [{ id: secondId, hue: '#5B9BD5' }],
        activeInstanceId: secondId,
      })
    })

    await waitFor(() => {
      // the closed instance's terminal is gone entirely, not just hidden
      expect(container.querySelectorAll('.xterm-helper-textarea').length).toBe(1)
    })
    expect(killMock).toHaveBeenCalledWith(TEST_INSTANCE_ID)
  })

  it('tears down the last terminal when every instance is closed, without crashing', async () => {
    const { container } = render(<Chat />)
    await waitFor(() => {
      expect(container.querySelectorAll('.xterm-helper-textarea').length).toBe(1)
    })

    // closeAllInstances() leaves nothing behind and no active id.
    act(() => {
      useClaudeStore.setState({ instances: [], activeInstanceId: '' })
    })

    await waitFor(() => {
      expect(container.querySelectorAll('.xterm-helper-textarea').length).toBe(0)
    })
    const killMock = (window.api as any).claudeKill as ReturnType<typeof vi.fn>
    expect(killMock).toHaveBeenCalledWith(TEST_INSTANCE_ID)
  })
})
