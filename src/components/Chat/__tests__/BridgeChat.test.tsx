import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { BridgeChat } from '../BridgeChat'
import { useBridgeStore, type BridgeConversation } from '@/stores/bridgeStore'
import { useClaudeStore } from '@/stores/claudeStore'
import { useBridgeSettingsStore } from '@/stores/bridgeSettingsStore'
import { useLlamaStore } from '@/stores/llamaStore'

const setConv = (patch: Partial<BridgeConversation>) =>
  useBridgeStore.setState((s) => ({ conversations: { ...s.conversations, s1: { ...s.conversations.s1, ...patch } } }))

beforeEach(() => {
  ;(global as any).window.api = {
    ...(global as any).window.api,
    onBridgeEvent: vi.fn(() => () => {}),
    bridgeSend: vi.fn(),
    bridgeApprove: vi.fn(),
    bridgeReject: vi.fn(),
    bridgeCancel: vi.fn(),
    bridgeSetReasoningEffort: vi.fn(),
    llamaGetLog: vi.fn(async () => null),
    onLlamaData: vi.fn(() => () => {}),
    onLlamaExit: vi.fn(() => () => {}),
  }
  useLlamaStore.setState({ runs: {} })
  useBridgeStore.setState({ conversations: {} })
  useBridgeStore.getState().openConversation('s1', false)
  useClaudeStore.setState({ pendingInjection: null, focusToken: 0 })
})

afterEach(() => cleanup())

describe('BridgeChat', () => {
  it('renders user and assistant message bubbles', () => {
    setConv({
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ],
    })
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    expect(screen.getByText('hello')).toBeTruthy()
    expect(screen.getByText('hi there')).toBeTruthy()
  })

  it('renders a pending-approval tool-call step with Allow/Deny buttons', () => {
    setConv({
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'write_file', args: { path: '/x' }, status: 'pending-approval' }],
        },
      ],
    })
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    expect(screen.getByText('Wants to write')).toBeTruthy()
    expect(screen.getByText('Allow')).toBeTruthy()
    expect(screen.getByText('Deny')).toBeTruthy()
  })

  it('calls approveToolCall when Allow is clicked', () => {
    setConv({
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'write_file', args: { path: '/x' }, status: 'pending-approval' }],
        },
      ],
    })
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    fireEvent.click(screen.getByText('Allow'))
    expect((global as any).window.api.bridgeApprove).toHaveBeenCalledWith('call_1', 's1')
  })

  it('sends a message on submit and clears the input', () => {
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    const input = screen.getByPlaceholderText('Message Bridge…') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'do the thing' } })
    fireEvent.submit(input.closest('form')!)

    expect((global as any).window.api.bridgeSend).toHaveBeenCalled()
    expect(input.value).toBe('')
  })

  it('marks Agent as pressed when agentMode is true', () => {
    setConv({ agentMode: true })
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    expect(screen.getByRole('button', { name: 'Agent' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Ask' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('marks Ask as pressed when agentMode is false', () => {
    setConv({ agentMode: false })
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    expect(screen.getByRole('button', { name: 'Ask' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('switches to agent mode when Agent is clicked, and clicking it again keeps it on', () => {
    setConv({ agentMode: false })
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    expect(useBridgeStore.getState().conversations.s1.agentMode).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Agent' }))
    expect(useBridgeStore.getState().conversations.s1.agentMode).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
    expect(useBridgeStore.getState().conversations.s1.agentMode).toBe(false)
  })

  it('does not show a Stop button when not streaming', () => {
    setConv({ streaming: false })
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    expect(screen.queryByLabelText('Stop')).toBeNull()
  })

  it('shows a Stop button while streaming that calls cancel()', () => {
    setConv({ streaming: true })
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    fireEvent.click(screen.getByLabelText('Stop'))

    expect((global as any).window.api.bridgeCancel).toHaveBeenCalled()
    expect(useBridgeStore.getState().conversations.s1.streaming).toBe(false)
  })

  it('defaults a pending-approval tool call to expanded, showing its args without an extra click', () => {
    setConv({
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'write_file', args: { path: '/x', content: 'hello world' }, status: 'pending-approval' }],
        },
      ],
    })
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    expect(screen.getByText(/hello world/)).toBeTruthy()
  })

  it('does not expand a non-pending tool call by default', () => {
    setConv({
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'write_file', args: { path: '/x', content: 'hello world' }, status: 'done', result: 'ok' }],
        },
      ],
    })
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    expect(screen.queryByText(/hello world/)).toBeNull()
  })

  it('injects a pendingInjection into the draft input and focuses the textarea', () => {
    setConv({ draftInput: 'existing question' })
    useClaudeStore.setState({
      pendingInjection: 'In src/foo.ts (line 1):\n```ts\ncode\n```',
      focusToken: 1,
    })

    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    const textarea = screen.getByPlaceholderText('Message Bridge…') as HTMLTextAreaElement
    expect(textarea.value).toBe('existing question\nIn src/foo.ts (line 1):\n```ts\ncode\n```')
    expect(useClaudeStore.getState().pendingInjection).toBeNull()
    expect(document.activeElement).toBe(textarea)
  })

  it('does not inject anything when focusToken is still at its initial value', () => {
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    const textarea = screen.getByPlaceholderText('Message Bridge…') as HTMLTextAreaElement
    expect(textarea.value).toBe('')
  })

  it('shows the thinking indicator while streaming before the first token arrives', () => {
    setConv({
      streaming: true,
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: '' },
      ],
    })
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    expect(screen.getByRole('status', { name: /thinking/i })).toBeTruthy()
  })

  it('hides the thinking indicator once the assistant starts producing text', () => {
    setConv({
      streaming: true,
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    })
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    expect(screen.queryByRole('status', { name: /thinking/i })).toBeNull()
  })

  it('hides the thinking dots once a tool call appears while streaming', () => {
    setConv({
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
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    expect(screen.queryByRole('status', { name: /thinking/i })).toBeNull()
  })

  it('shows no thinking indicator when not streaming', () => {
    setConv({
      streaming: false,
      messages: [{ role: 'assistant', content: 'done' }],
    })
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    expect(screen.queryByRole('status', { name: /thinking/i })).toBeNull()
  })

  it('does not steal focus on remount when focusToken was already bumped by an earlier mount', () => {
    // Simulates: an earlier Cmd+L press happened while some other BridgeChat instance was
    // mounted (bumping focusToken and consuming the injection), then the user switches away
    // and back to the Bridge tab, remounting BridgeChat with that already-stale token.
    useClaudeStore.setState({ pendingInjection: null, focusToken: 5 })

    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    const textarea = screen.getByPlaceholderText('Message Bridge…') as HTMLTextAreaElement
    expect(textarea.value).toBe('')
    expect(document.activeElement).not.toBe(textarea)
  })

  it('shows finished reasoning collapsed with its duration, and expands it on click', () => {
    setConv({
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'answer', reasoning: 'first line\nsecond line', reasoningStartedAt: 1000, reasoningMs: 6100 },
      ],
    })
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    expect(screen.getByText('for 6.1s')).toBeTruthy()
    expect(screen.queryByText(/second line/)).toBeNull()
    fireEvent.click(screen.getByText('Reasoned'))
    expect(screen.getByText(/second line/)).toBeTruthy()
  })

  it('streams live reasoning instead of the thinking placeholder', () => {
    setConv({
      streaming: true,
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: '', reasoning: 'working it out', reasoningStartedAt: Date.now() },
      ],
    })
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    expect(screen.getByText('Reasoning')).toBeTruthy()
    expect(screen.getByText(/working it out/)).toBeTruthy()
    expect(screen.queryByRole('status', { name: /thinking/i })).toBeNull()
  })

  it('shows an edit_file diff and a turn summary once the turn is done', () => {
    setConv({
      messages: [
        { role: 'user', content: 'fix it' },
        {
          role: 'assistant',
          content: '',
          startedAt: 0,
          endedAt: 2000,
          toolCalls: [{ id: 'c1', name: 'edit_file', args: { path: '/project/a.ts', old_string: 'x = 1', new_string: 'x = 2' }, status: 'done', result: 'ok' }],
        },
        { role: 'assistant', content: 'Fixed.', startedAt: 2000, endedAt: 3000 },
      ],
    })
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)

    expect(screen.getByText('Edited')).toBeTruthy()
    expect(screen.getByText('a.ts')).toBeTruthy()
    expect(screen.getByText('x = 2')).toBeTruthy()
    expect(screen.getByText('Fixed.')).toBeTruthy()
    expect(screen.getByText('Worked 3.0s')).toBeTruthy()
    expect(screen.getByText('1 file changed')).toBeTruthy()
  })

  it('shows no reasoning effort chip without a llama connection', () => {
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)
    expect(screen.queryByRole('button', { name: /Reasoning effort/ })).toBeNull()
  })

  it('shows the model effort on a llama session and switches it from the menu', () => {
    const conn = { endpoint: 'http://h/v1', apiKey: 'k', modelId: 'm', reasoningEffort: 'medium' as const }
    render(<BridgeChat sessionId="s1" label="Llama" cwd="/project" connectionOverride={conn} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reasoning effort: Medium' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /High/ }))

    expect(useBridgeStore.getState().conversations.s1.reasoningEffort).toBe('high')
    expect(screen.getByRole('button', { name: 'Reasoning effort: High' })).toBeTruthy()
  })

  it('marks a mid-turn effort change on the rail', () => {
    setConv({
      streaming: true,
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: '', effortChange: { from: 'low', to: 'high' }, toolCalls: [{ id: 'c1', name: 'list_dir', args: { path: '/project' }, status: 'running' }] },
      ],
    })
    render(<BridgeChat sessionId="s1" label="Llama" cwd="/project" />)

    expect(screen.getByText(/Effort Low →/)).toBeTruthy()
    expect(screen.getByText('· from the next step')).toBeTruthy()
  })

  it('header shows the llama model, server status, speed and context use', () => {
    setConv({ contextUsage: { usedTokens: 12400, contextWindow: 32768, tokensPerSecond: 41.6 } })
    const conn = { endpoint: 'http://h/v1', apiKey: 'k', modelId: 'qwen3-coder-30b', reasoningEffort: 'medium' as const }
    render(<BridgeChat sessionId="s1" label="Llama" cwd="/project" connectionOverride={conn} serverRunning />)

    expect(screen.getByText('qwen3-coder-30b')).toBeTruthy()
    expect(screen.getByText('llama.cpp · local · 42 tok/s')).toBeTruthy()
    expect(screen.getByTitle('Server running')).toBeTruthy()
    expect(screen.getByText('12k')).toBeTruthy()
    expect(screen.getByText('of 33k')).toBeTruthy()
    expect(screen.getByRole('img', { name: '38% of context used' })).toBeTruthy()
  })

  it('header on a Bridge session names the endpoint host and has no server dot', () => {
    useBridgeSettingsStore.setState({ endpoint: 'http://localhost:8002/v1', modelId: 'gpt-oss-20b' })
    render(<BridgeChat sessionId="s1" label="Bridge" cwd="/project" />)
    expect(screen.getByText('gpt-oss-20b')).toBeTruthy()
    expect(screen.getByText('Bridge · localhost:8002')).toBeTruthy()
    expect(screen.queryByTitle(/Server (running|stopped)/)).toBeNull()
  })

  it('placeholder names the agent', () => {
    render(<BridgeChat sessionId="s1" label="Qwen 32B" cwd="/p" />)
    expect(screen.getByPlaceholderText('Message Qwen 32B…')).toBeInTheDocument()
  })

  describe('composer light', () => {
    const progressLine = (p: number) =>
      `slot update_slots: id  0 | task 7 | prompt processing progress, n_tokens = 512, batch.n_tokens = 512, progress = ${p}\n`
    const setLog = (output: string) =>
      useLlamaStore.setState({ runs: { m1: { running: true, output, error: null, exitCode: null, logged: true } } })

    it('fills with prompt progress from the llama-server log', () => {
      setLog(progressLine(0.51))
      setConv({ streaming: true, messages: [{ role: 'user', content: 'go' }] })
      const { container } = render(<BridgeChat sessionId="s1" label="Qwen" cwd="/project" serverId="m1" />)

      expect(screen.getByText('Reading prompt 51%')).toBeTruthy()
      expect((container.querySelector('.bridge-light-fill') as HTMLElement).style.width).toBe('51%')
    })

    it('sweeps once the prompt is read', () => {
      setLog(progressLine(1) + 'slot update_slots: id  0 | task 7 | prompt done, n_tokens = 512\n')
      setConv({ streaming: true, messages: [{ role: 'user', content: 'go' }, { role: 'assistant', content: 'Hel' }] })
      const { container } = render(<BridgeChat sessionId="s1" label="Qwen" cwd="/project" serverId="m1" />)

      expect(screen.getByText('Writing')).toBeTruthy()
      expect(container.querySelector('.bridge-light-sweep')).toBeTruthy()
    })

    it('is off while a tool runs and when no turn is running', () => {
      setLog(progressLine(0.5))
      setConv({
        streaming: true,
        messages: [{ role: 'assistant', content: '', toolCalls: [{ id: 't', name: 'run_command', args: {}, status: 'running' }] }],
      })
      const { container, rerender } = render(<BridgeChat sessionId="s1" label="Qwen" cwd="/project" serverId="m1" />)
      expect(container.querySelector('.bridge-light-fill, .bridge-light-sweep')).toBeNull()

      setConv({ streaming: false, messages: [] })
      rerender(<BridgeChat sessionId="s1" label="Qwen" cwd="/project" serverId="m1" />)
      expect(container.querySelector('.bridge-light-fill, .bridge-light-sweep')).toBeNull()
    })

    it('turns red when nothing moves for two minutes', () => {
      vi.useFakeTimers()
      try {
        setLog(progressLine(0.3))
        setConv({ streaming: true, messages: [{ role: 'user', content: 'go' }] })
        const { container } = render(<BridgeChat sessionId="s1" label="Qwen" cwd="/project" serverId="m1" />)
        act(() => { vi.advanceTimersByTime(121_000) })

        expect(screen.getByText('No progress for 2m')).toBeTruthy()
        expect((container.querySelector('.bridge-light-stalled') as HTMLElement).style.width).toBe('30%')
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
