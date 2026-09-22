import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { GitPromptHost } from '../GitPromptHost'
import { useGitPromptStore } from '@/stores/gitPromptStore'

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  (global as any).window.api = {
    gitBranchList: vi.fn().mockResolvedValue({ current: 'main', local: ['main'], remote: [] }),
  }
  useGitPromptStore.setState({ prompt: null })
})
afterEach(() => cleanup())

describe('GitPromptHost', () => {
  it('renders nothing without a prompt', () => {
    const { container } = render(<GitPromptHost />)
    expect(container.textContent).toBe('')
  })

  it('shows the existing force-push confirm', () => {
    useGitPromptStore.setState({ prompt: { kind: 'forcePush', action: 'forcePush', cwd: '/r' } })
    render(<GitPromptHost />)
    expect(screen.getByText('Force push')).toBeTruthy()
  })

  it('shows the existing undo-commit confirm', () => {
    useGitPromptStore.setState({ prompt: { kind: 'undoCommit', cwd: '/r' } })
    render(<GitPromptHost />)
    expect(screen.getByText('Undo Last Commit')).toBeTruthy()
  })

  it('hard reset: picker first, then the existing confirm after a pick', async () => {
    useGitPromptStore.setState({ prompt: { kind: 'hardResetPick', cwd: '/r' } })
    render(<GitPromptHost />)
    const input = await screen.findByRole('textbox')
    fireEvent.change(input, { target: { value: 'abc1234' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(useGitPromptStore.getState().prompt).toEqual({ kind: 'hardResetConfirm', cwd: '/r', ref: 'abc1234' })
  })

  it('generic confirm runs onConfirm and closes; Cancel just closes', () => {
    const onConfirm = vi.fn()
    useGitPromptStore.setState({
      prompt: { kind: 'confirm', cwd: '/r', title: 'Delete Branch', message: 'Really?', confirmLabel: 'Delete', onConfirm },
    })
    render(<GitPromptHost />)
    expect(screen.getByText('Really?')).toBeTruthy()
    fireEvent.click(screen.getByText('Cancel'))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(useGitPromptStore.getState().prompt).toBeNull()

    act(() => {
      useGitPromptStore.setState({
        prompt: { kind: 'confirm', cwd: '/r', title: 'Delete Branch', message: 'Really?', confirmLabel: 'Delete', onConfirm },
      })
    })
    fireEvent.click(screen.getByText('Delete'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(useGitPromptStore.getState().prompt).toBeNull()
  })
})
