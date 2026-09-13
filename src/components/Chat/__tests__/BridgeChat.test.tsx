import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { BridgeChat } from '../BridgeChat'
import { useBridgeStore } from '@/stores/bridgeStore'
import { useClaudeStore } from '@/stores/claudeStore'

beforeEach(() => {
  ;(global as any).window.api = {
    ...(global as any).window.api,
    onBridgeEvent: vi.fn(() => () => {}),
    bridgeSend: vi.fn(),
    bridgeApprove: vi.fn(),
    bridgeReject: vi.fn(),
    bridgeCancel: vi.fn(),
  }
  useBridgeStore.setState({ messages: [], previousMessages: [], streaming: false, agentMode: false, draftInput: '' })
  useClaudeStore.setState({ pendingInjection: null, focusToken: 0 })
})

afterEach(() => cleanup())

describe('BridgeChat', () => {
  it('renders user and assistant message bubbles', () => {
    useBridgeStore.setState({
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ],
    })
    render(<BridgeChat cwd="/project" />)

    expect(screen.getByText('hello')).toBeTruthy()
    expect(screen.getByText('hi there')).toBeTruthy()
  })

  it('renders a pending-approval tool-call block with Approve/Reject buttons', () => {
    useBridgeStore.setState({
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'write_file', args: { path: '/x' }, status: 'pending-approval' }],
        },
      ],
    })
    render(<BridgeChat cwd="/project" />)

    expect(screen.getByText('write_file')).toBeTruthy()
    expect(screen.getByText('Approve')).toBeTruthy()
    expect(screen.getByText('Reject')).toBeTruthy()
  })

  it('calls approveToolCall when Approve is clicked', () => {
    useBridgeStore.setState({
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'write_file', args: { path: '/x' }, status: 'pending-approval' }],
        },
      ],
    })
    render(<BridgeChat cwd="/project" />)

    fireEvent.click(screen.getByText('Approve'))
    expect((global as any).window.api.bridgeApprove).toHaveBeenCalledWith('call_1')
  })

  it('sends a message on submit and clears the input', () => {
    render(<BridgeChat cwd="/project" />)

    const input = screen.getByPlaceholderText('Message Bridge…') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'do the thing' } })
    fireEvent.submit(input.closest('form')!)

    expect((global as any).window.api.bridgeSend).toHaveBeenCalled()
    expect(input.value).toBe('')
  })

  it('shows an Agent Mode: On indicator when agentMode is true', () => {
    useBridgeStore.setState({ agentMode: true })
    render(<BridgeChat cwd="/project" />)

    expect(screen.getByText('Agent Mode: On')).toBeTruthy()
  })

  it('shows an Agent Mode: Off indicator when agentMode is false', () => {
    useBridgeStore.setState({ agentMode: false })
    render(<BridgeChat cwd="/project" />)

    expect(screen.getByText('Agent Mode: Off')).toBeTruthy()
  })

  it('toggles agentMode when the indicator is clicked', () => {
    useBridgeStore.setState({ agentMode: false })
    render(<BridgeChat cwd="/project" />)

    fireEvent.click(screen.getByText('Agent Mode: Off'))

    expect(useBridgeStore.getState().agentMode).toBe(true)
  })

  it('does not show a Stop button when not streaming', () => {
    useBridgeStore.setState({ streaming: false })
    render(<BridgeChat cwd="/project" />)

    expect(screen.queryByText('Stop')).toBeNull()
  })

  it('shows a Stop button while streaming that calls cancel()', () => {
    useBridgeStore.setState({ streaming: true })
    render(<BridgeChat cwd="/project" />)

    fireEvent.click(screen.getByText('Stop'))

    expect((global as any).window.api.bridgeCancel).toHaveBeenCalled()
    expect(useBridgeStore.getState().streaming).toBe(false)
  })

  it('defaults a pending-approval tool call to expanded, showing its args without an extra click', () => {
    useBridgeStore.setState({
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'write_file', args: { path: '/x', content: 'hello world' }, status: 'pending-approval' }],
        },
      ],
    })
    render(<BridgeChat cwd="/project" />)

    expect(screen.getByText(/hello world/)).toBeTruthy()
  })

  it('does not expand a non-pending tool call by default', () => {
    useBridgeStore.setState({
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'write_file', args: { path: '/x', content: 'hello world' }, status: 'done', result: 'ok' }],
        },
      ],
    })
    render(<BridgeChat cwd="/project" />)

    expect(screen.queryByText(/hello world/)).toBeNull()
  })

  it('injects a pendingInjection into the draft input and focuses the textarea', () => {
    useBridgeStore.setState({ draftInput: 'existing question' })
    useClaudeStore.setState({
      pendingInjection: 'In src/foo.ts (line 1):\n```ts\ncode\n```',
      focusToken: 1,
    })

    render(<BridgeChat cwd="/project" />)

    const textarea = screen.getByPlaceholderText('Message Bridge…') as HTMLTextAreaElement
    expect(textarea.value).toBe('existing question\nIn src/foo.ts (line 1):\n```ts\ncode\n```')
    expect(useClaudeStore.getState().pendingInjection).toBeNull()
    expect(document.activeElement).toBe(textarea)
  })

  it('does not inject anything when focusToken is still at its initial value', () => {
    render(<BridgeChat cwd="/project" />)

    const textarea = screen.getByPlaceholderText('Message Bridge…') as HTMLTextAreaElement
    expect(textarea.value).toBe('')
  })

  it('shows the thinking indicator while streaming before the first token arrives', () => {
    useBridgeStore.setState({
      streaming: true,
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: '' },
      ],
    })
    render(<BridgeChat cwd="/project" />)

    expect(screen.getByRole('status', { name: /thinking/i })).toBeTruthy()
  })

  it('hides the thinking indicator once the assistant starts producing text', () => {
    useBridgeStore.setState({
      streaming: true,
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    })
    render(<BridgeChat cwd="/project" />)

    expect(screen.queryByRole('status', { name: /thinking/i })).toBeNull()
  })

  it('hides the thinking dots once a tool call appears while streaming', () => {
    useBridgeStore.setState({
      streaming: true,
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'read_file', args: { path: '/x' }, status: 'running' }],
        },
      ],
    })
    render(<BridgeChat cwd="/project" />)

    expect(screen.queryByRole('status', { name: /thinking/i })).toBeNull()
  })

  it('shows no thinking indicator when not streaming', () => {
    useBridgeStore.setState({
      streaming: false,
      messages: [{ role: 'assistant', content: 'done' }],
    })
    render(<BridgeChat cwd="/project" />)

    expect(screen.queryByRole('status', { name: /thinking/i })).toBeNull()
  })

  it('does not steal focus on remount when focusToken was already bumped by an earlier mount', () => {
    // Simulates: an earlier Cmd+L press happened while some other BridgeChat instance was
    // mounted (bumping focusToken and consuming the injection), then the user switches away
    // and back to the Bridge tab, remounting BridgeChat with that already-stale token.
    useClaudeStore.setState({ pendingInjection: null, focusToken: 5 })

    render(<BridgeChat cwd="/project" />)

    const textarea = screen.getByPlaceholderText('Message Bridge…') as HTMLTextAreaElement
    expect(textarea.value).toBe('')
    expect(document.activeElement).not.toBe(textarea)
  })
})
