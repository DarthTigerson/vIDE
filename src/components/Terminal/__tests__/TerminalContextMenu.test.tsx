/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TerminalContextMenu } from '../TerminalContextMenu'
import { useClaudeStore } from '@/stores/claudeStore'

let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  useClaudeStore.setState({ pendingInjection: null, chatVisible: false, focusToken: 0 })
})
afterEach(() => cleanup())

describe('TerminalContextMenu', () => {
  it('Copy writes the selection to the clipboard and closes the menu', () => {
    const onClose = vi.fn()
    render(<TerminalContextMenu x={10} y={10} selection="npm ERR! boom" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('npm ERR! boom')
    expect(onClose).toHaveBeenCalled()
  })

  it('Send to Claude hands the formatted selection to the chat and closes the menu', () => {
    const onClose = vi.fn()
    render(<TerminalContextMenu x={10} y={10} selection="npm ERR! boom" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /Send to Claude/ }))
    expect(useClaudeStore.getState().pendingInjection).toBe('Terminal output:\n```\nnpm ERR! boom\n```')
    expect(useClaudeStore.getState().chatVisible).toBe(true)
    expect(onClose).toHaveBeenCalled()
  })

  it('disables both actions when nothing is selected', () => {
    render(<TerminalContextMenu x={10} y={10} selection="" onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Send to Claude/ })).toBeDisabled()
  })

  it('shows the Cmd+L shortcut hint on Send to Claude', () => {
    render(<TerminalContextMenu x={10} y={10} selection="x" onClose={() => {}} />)
    expect(screen.getByRole('button', { name: /Send to Claude/ }).textContent).toMatch(/L/)
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<TerminalContextMenu x={10} y={10} selection="x" onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
