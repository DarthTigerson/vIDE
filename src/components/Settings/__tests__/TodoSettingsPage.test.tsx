/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { TodoSettingsPage } from '../TodoSettingsPage'
import { useTodoSettingsStore } from '@/stores/todoSettingsStore'
import { useTodoMcpStore } from '@/stores/todoMcpStore'

;(window as any).api = {
  todosMcpEnable: vi.fn().mockResolvedValue(undefined),
  todosMcpDisable: vi.fn().mockResolvedValue(undefined),
}

afterEach(() => {
  cleanup()
  useTodoSettingsStore.setState({ enabled: true })
  useTodoMcpStore.setState({ enabled: false, pending: false, error: null })
  vi.clearAllMocks()
})

describe('TodoSettingsPage', () => {
  it('renders the Enable To Do toggle on by default', () => {
    render(<TodoSettingsPage />)
    const toggle = screen.getByRole('switch', { name: 'Enable To Do' })
    expect(toggle).not.toBeDisabled()
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  it('clicking the toggle disables To Do in the store', () => {
    render(<TodoSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Enable To Do' }))
    expect(useTodoSettingsStore.getState().enabled).toBe(false)
  })

  it('renders the Claude MCP toggle off by default', () => {
    render(<TodoSettingsPage />)
    const toggle = screen.getByRole('switch', { name: /let claude/i })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('clicking the Claude MCP toggle registers the MCP server and flips it on', async () => {
    render(<TodoSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: /let claude/i }))

    expect(window.api.todosMcpEnable).toHaveBeenCalled()
    await waitFor(() => expect(useTodoMcpStore.getState().enabled).toBe(true))
  })

  it('shows an error message if enabling the MCP server fails', async () => {
    vi.mocked(window.api.todosMcpEnable).mockRejectedValueOnce(new Error("'claude' was not found in PATH"))
    render(<TodoSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: /let claude/i }))

    expect(await screen.findByText(/claude.*not found/i)).toBeInTheDocument()
  })
})
