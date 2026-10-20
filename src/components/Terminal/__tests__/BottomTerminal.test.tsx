import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, createEvent } from '@testing-library/react'

vi.mock('../TerminalTab', () => ({
  TerminalTab: ({ terminalId }: { terminalId: string }) => <div data-testid="terminal">{terminalId}</div>,
}))
vi.mock('@/lib/liveTerminals', () => ({ clearLiveTerminal: vi.fn() }))

// jsdom has no DataTransfer; one shared object carries a drag's payload
// from dragstart through dragover to drop, like the browser's.
function dataTransfer() {
  const data = new Map<string, string>()
  return {
    get types() { return [...data.keys()] },
    setData: (k: string, v: string) => void data.set(k, v),
    getData: (k: string) => data.get(k) ?? '',
    effectAllowed: '',
    dropEffect: '',
  }
}

// jsdom's drag events ignore clientX in their init, so it's set by hand.
function dragAt(type: 'dragOver' | 'drop', el: Element, dt: ReturnType<typeof dataTransfer>, clientX: number) {
  const event = createEvent[type](el, { dataTransfer: dt })
  Object.defineProperty(event, 'clientX', { value: clientX })
  fireEvent(el, event)
}

function rectOf(el: Element, left: number, width: number) {
  el.getBoundingClientRect = () => ({ left, width, top: 0, height: 200, right: left + width, bottom: 200, x: left, y: 0, toJSON: () => ({}) })
}

import { BottomTerminal } from '../BottomTerminal'
import { useBottomTerminalStore } from '@/stores/bottomTerminalStore'
import { clearLiveTerminal } from '@/lib/liveTerminals'

beforeEach(() => {
  useBottomTerminalStore.setState({ enabled: true, sides: [['a', 'b']], active: ['b'], focusedSide: 0, origins: {} })
})

afterEach(cleanup)

describe('BottomTerminal', () => {
  it('shows one tab per terminal and only the active one', () => {
    render(<BottomTerminal />)
    expect(screen.getAllByTestId('bottom-terminal-tab')).toHaveLength(2)
    expect(screen.getAllByTestId('terminal').map((el) => el.textContent)).toEqual(['b'])
    fireEvent.click(screen.getAllByTestId('bottom-terminal-tab')[0])
    expect(screen.getAllByTestId('terminal').map((el) => el.textContent)).toEqual(['a'])
  })

  it('splits into a second side with its own tabs, and merges back', () => {
    render(<BottomTerminal />)
    fireEvent.click(screen.getByRole('button', { name: 'Split right' }))
    expect(useBottomTerminalStore.getState().sides).toHaveLength(2)
    expect(screen.getAllByTestId('terminal')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'New terminal' })).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Merge sides' }))
    expect(useBottomTerminalStore.getState().sides).toHaveLength(1)
  })

  it('closes a tab from its ×, and offers a new terminal once empty', () => {
    render(<BottomTerminal />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Close Terminal' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Close Terminal' })[0])
    expect(screen.getByText('No terminals')).toBeTruthy()
    fireEvent.click(screen.getByText('New terminal'))
    expect(useBottomTerminalStore.getState().sides[0]).toHaveLength(1)
  })

  it('reorders tabs by dragging one onto another', () => {
    render(<BottomTerminal />)
    const [a, b] = screen.getAllByTestId('bottom-terminal-tab')
    rectOf(a, 0, 100)
    const dt = dataTransfer()
    fireEvent.dragStart(b, { dataTransfer: dt })
    dragAt('dragOver', a, dt, 10)
    dragAt('drop', a, dt, 10)
    expect(useBottomTerminalStore.getState().sides).toEqual([['b', 'a']])
  })

  it('splits when a tab is dropped on the terminal’s right edge', () => {
    render(<BottomTerminal />)
    const [a] = screen.getAllByTestId('bottom-terminal-tab')
    const zone = screen.getByTestId('bottom-terminal-drop-zone')
    rectOf(zone.parentElement!, 0, 400)
    const dt = dataTransfer()
    fireEvent.dragStart(a, { dataTransfer: dt })
    dragAt('dragOver', zone, dt, 390)
    dragAt('drop', zone, dt, 390)
    expect(useBottomTerminalStore.getState().sides).toEqual([['b'], ['a']])
  })

  it('moves a tab to the other side when dropped on its terminal', () => {
    useBottomTerminalStore.setState({ sides: [['a', 'b'], ['c']], active: ['b', 'c'] })
    render(<BottomTerminal />)
    const [a] = screen.getAllByTestId('bottom-terminal-tab')
    const zone = screen.getAllByTestId('bottom-terminal-drop-zone')[1]
    rectOf(zone.parentElement!, 400, 400)
    const dt = dataTransfer()
    fireEvent.dragStart(a, { dataTransfer: dt })
    dragAt('dragOver', zone, dt, 790)
    dragAt('drop', zone, dt, 790)
    expect(useBottomTerminalStore.getState().sides).toEqual([['b'], ['c', 'a']])
  })

  it('opens a right-click menu on a tab', () => {
    render(<BottomTerminal />)
    fireEvent.contextMenu(screen.getAllByTestId('bottom-terminal-tab')[0])
    fireEvent.click(screen.getByText('Clear Terminal'))
    expect(clearLiveTerminal).toHaveBeenCalledWith('a')
    fireEvent.contextMenu(screen.getAllByTestId('bottom-terminal-tab')[0])
    fireEvent.click(screen.getByText('Split Right'))
    expect(useBottomTerminalStore.getState().sides).toEqual([['b'], ['a']])
    fireEvent.contextMenu(screen.getAllByTestId('bottom-terminal-tab')[1])
    fireEvent.click(screen.getByText('Move to Left Side'))
    expect(useBottomTerminalStore.getState().sides).toEqual([['b', 'a']])
    fireEvent.contextMenu(screen.getAllByTestId('bottom-terminal-tab')[0])
    fireEvent.click(screen.getByText('Close Others'))
    expect(useBottomTerminalStore.getState().sides).toEqual([['b']])
  })
})
