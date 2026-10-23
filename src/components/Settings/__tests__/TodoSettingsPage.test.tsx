/// <reference types="@testing-library/jest-dom" />
import { DEFAULT_AI_PRESET_VALUES } from '../../../../electron/aiRulesPresets'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.hoisted(() => {
  const store: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
  }
  ;(global as any).window = (global as any).window ?? {}
  ;(global as any).window.api = {
    todosMcpEnable: () => Promise.resolve(),
    todosMcpDisable: () => Promise.resolve(),
  }
})

import { TodoSettingsPage } from '../TodoSettingsPage'
import { useTodoSettingsStore } from '@/stores/todoSettingsStore'
import { useTodoMcpStore } from '@/stores/todoMcpStore'

beforeEach(() => {
  ;(global as any).window.api = {
    todosMcpEnable: vi.fn().mockResolvedValue(undefined),
    todosMcpDisable: vi.fn().mockResolvedValue(undefined),
    aiRulesGet: vi.fn().mockResolvedValue({ enabled: true, presets: DEFAULT_AI_PRESET_VALUES, boards: [], lists: { general: [], todos: ['Track work'], scripts: [], notes: [], browser: [], graphify: ['Query first'] } }),
    aiRulesSet: vi.fn().mockResolvedValue(undefined),
    aiRulesGetDefaults: vi.fn(),
    todosListProjects: vi.fn().mockResolvedValue([{ id: 'p1', name: 'DevOps Tools', key: 'DTOOLS', nextNumber: 1, createdAt: 0 }]),
  }
})

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

  it('explains that the toggle also blocks Claude from ending a turn without a progress comment', () => {
    render(<TodoSettingsPage />)
    expect(screen.getByText(/without.*a progress comment|before it can finish/i)).toBeInTheDocument()
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

describe('TodoSettingsPage AI rules', () => {
  it('shows the todos rules list only while the Claude Code switch is on', async () => {
    useTodoMcpStore.setState({ enabled: false })
    const { unmount } = render(<TodoSettingsPage />)
    expect(screen.queryByRole('group', { name: 'AI rules' })).not.toBeInTheDocument()
    unmount()

    useTodoMcpStore.setState({ enabled: true })
    render(<TodoSettingsPage />)
    await waitFor(() => expect(screen.getByLabelText('Extra rules 1')).toHaveValue('Track work'))
    expect(screen.getByRole('switch', { name: 'Track work automatically' })).toBeInTheDocument()
  })

  it('adds a board rule row and saves the picked board with its name', async () => {
    useTodoMcpStore.setState({ enabled: true })
    render(<TodoSettingsPage />)
    await waitFor(() => expect(screen.getByLabelText('Extra rules 1')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Add board rule' }))
    fireEvent.change(screen.getByLabelText('Use for 1'), { target: { value: 'devops-self-service' } })

    const saved = vi.mocked(window.api.aiRulesSet).mock.calls.at(-1)![0] as any
    expect(saved.boards).toEqual([{ board: '', boardName: '', useFor: 'devops-self-service', notFor: '', tags: '', folders: '' }])
  })
})
