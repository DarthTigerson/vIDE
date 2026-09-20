/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { Terminal as XTerm } from '@xterm/xterm'
import { DockerLogTerminal } from '../DockerLogTerminal'
import { useClaudeStore } from '@/stores/claudeStore'
import { useInstanceFontSizeStore } from '@/stores/instanceFontSizeStore'

// Real xterm in jsdom (same approach as Chat's terminalLinks integration
// test): the instance is captured off XTerm.prototype.open so assertions read
// the real buffer/selection the component is driving.
let instances: XTerm[]
let keyHandlers: Array<(e: KeyboardEvent) => boolean>
let dataCb: ((id: string, data: string) => void) | null
let exitCb: ((id: string) => void) | null
let streamId: string
let dockerRunLogs: ReturnType<typeof vi.fn>
let dockerStopLogs: ReturnType<typeof vi.fn>

const tick = (ms = 50) => new Promise<void>((r) => setTimeout(r, ms)) // xterm.write parses async

function line(x: XTerm, n: number) {
  return x.buffer.active.getLine(n)?.translateToString(true)
}

async function emit(data: string, id = streamId) {
  await act(async () => {
    dataCb!(id, data)
    await tick()
  })
}

beforeEach(() => {
  instances = []
  keyHandlers = []
  dataCb = null
  exitCb = null
  const originalOpen = XTerm.prototype.open
  vi.spyOn(XTerm.prototype, 'open').mockImplementation(function (this: XTerm, parent: HTMLElement) {
    instances.push(this)
    return originalOpen.call(this, parent)
  })
  const originalAttach = XTerm.prototype.attachCustomKeyEventHandler
  vi.spyOn(XTerm.prototype, 'attachCustomKeyEventHandler').mockImplementation(function (this: XTerm, h: (e: KeyboardEvent) => boolean) {
    keyHandlers.push(h)
    return originalAttach.call(this, h)
  })
  dockerRunLogs = vi.fn((id: string) => { streamId = id })
  dockerStopLogs = vi.fn()
  ;(global as any).window.api = {
    ...(global as any).window.api,
    dockerRunLogs,
    dockerStopLogs,
    onDockerLogData: vi.fn((cb: (id: string, data: string) => void) => { dataCb = cb; return () => {} }),
    onDockerLogExit: vi.fn((cb: (id: string) => void) => { exitCb = cb; return () => {} }),
  }
  useClaudeStore.setState({ pendingInjection: null, chatVisible: false, focusToken: 0 })
  useInstanceFontSizeStore.setState({ overrides: {} })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function mount() {
  const utils = render(<DockerLogTerminal containerId="abc123" zoomKey="docker-logs://abc123/web" />)
  await waitFor(() => expect(instances.length).toBe(1))
  return { ...utils, xterm: instances[0] }
}

describe('DockerLogTerminal', () => {
  it('starts the log stream for the container', async () => {
    await mount()
    expect(dockerRunLogs).toHaveBeenCalledTimes(1)
    expect(dockerRunLogs.mock.calls[0][1]).toBe('abc123')
  })

  it('shows a placeholder until the first output arrives, then removes it', async () => {
    await mount()
    expect(screen.getByText('Waiting for output…')).toBeInTheDocument()
    await emit('INFO: started\n')
    expect(screen.queryByText('Waiting for output…')).not.toBeInTheDocument()
  })

  it('writes the log output into the terminal, one line per newline', async () => {
    const { xterm } = await mount()
    await emit('INFO: hello\nINFO: second line\n')
    expect(line(xterm, 0)).toBe('INFO: hello')
    expect(line(xterm, 1)).toBe('INFO: second line')
  })

  it('renders ANSI colour codes instead of showing them as raw text', async () => {
    const { xterm } = await mount()
    await emit('\u001b[32mOK\u001b[0m ready\n')
    expect(line(xterm, 0)).toBe('OK ready')
  })

  it('ignores output that belongs to a different stream', async () => {
    const { xterm } = await mount()
    await emit('someone else\n', 'other-stream')
    expect(line(xterm, 0)).toBe('')
    expect(screen.getByText('Waiting for output…')).toBeInTheDocument()
  })

  it('is read-only: the terminal accepts no input', async () => {
    const { xterm } = await mount()
    expect(xterm.options.disableStdin).toBe(true)
  })

  it('keeps the selection while more output streams in (VIDE-112: highlighting used to be wiped on every log line)', async () => {
    const { xterm } = await mount()
    await emit('INFO: select me\n')
    xterm.select(6, 0, 9) // "select me"
    expect(xterm.getSelection()).toBe('select me')

    await emit('INFO: another line arrives\nINFO: and another\n')

    expect(xterm.hasSelection()).toBe(true)
    expect(xterm.getSelection()).toBe('select me')
  })

  it('stops the log stream when it unmounts', async () => {
    const { unmount } = await mount()
    unmount()
    expect(dockerStopLogs).toHaveBeenCalledWith(streamId)
  })

  it('does not try to stop a stream that already exited', async () => {
    const { unmount } = await mount()
    exitCb!(streamId)
    unmount()
    expect(dockerStopLogs).not.toHaveBeenCalled()
  })

  it('restarts with a fresh terminal when the container changes', async () => {
    const { rerender } = await mount()
    const first = instances[0]
    await emit('old container output\n')
    rerender(<DockerLogTerminal containerId="def456" zoomKey="docker-logs://def456/db" />)
    await waitFor(() => expect(instances.length).toBe(2))
    expect(dockerStopLogs).toHaveBeenCalledWith(expect.any(String))
    expect(dockerRunLogs).toHaveBeenLastCalledWith(expect.any(String), 'def456')
    expect(line(instances[1], 0)).toBe('')
    expect(first).not.toBe(instances[1])
  })
})

describe('DockerLogTerminal — copy and send to Claude', () => {
  async function rightClick(container: HTMLElement) {
    fireEvent.contextMenu(container.firstElementChild as HTMLElement)
  }

  it('right-click shows Copy and Send to Claude, both disabled with nothing selected', async () => {
    const { container } = await mount()
    await rightClick(container)
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Send to Claude/ })).toBeDisabled()
  })

  it('right-click Copy is enabled with a selection and copies exactly that text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { container, xterm } = await mount()
    await emit('INFO: select me\n')
    xterm.select(6, 0, 9)

    await rightClick(container)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('select me')
  })

  it('right-click Send to Claude hands the selected logs to the chat', async () => {
    const { container, xterm } = await mount()
    await emit('ERROR: boom\n')
    xterm.select(0, 0, 11)

    await rightClick(container)
    fireEvent.click(screen.getByRole('button', { name: /Send to Claude/ }))
    expect(useClaudeStore.getState().pendingInjection).toBe('Terminal output:\n```\nERROR: boom\n```')
  })

  it('Cmd+L with a selection sends it to Claude (same key handler as terminal tabs)', async () => {
    const { xterm } = await mount()
    await emit('ERROR: boom\n')
    xterm.select(0, 0, 11)

    const event = { type: 'keydown', key: 'l', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent
    expect(keyHandlers[0](event)).toBe(false)
    expect(useClaudeStore.getState().pendingInjection).toBe('Terminal output:\n```\nERROR: boom\n```')
  })

  it('Cmd+= zooms just this log view, keyed by its tab', async () => {
    await mount()
    const event = { type: 'keydown', key: '=', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent
    keyHandlers[0](event)
    expect(useInstanceFontSizeStore.getState().overrides['docker-logs://abc123/web']).toBeDefined()
  })
})
