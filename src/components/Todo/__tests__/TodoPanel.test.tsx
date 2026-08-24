/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { TodoPanel } from '../TodoPanel'
import { useTodoStore } from '@/stores/todoStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildTodoBoardPath } from '@/components/Settings/paths'

const openTabMock = vi.fn()

beforeEach(() => {
  openTabMock.mockClear()
  useTodoStore.setState({ projects: [], todosByProject: {} })
  useEditorStore.setState({ openTab: openTabMock })
})

afterEach(() => {
  cleanup()
})

function mockApi(overrides: Partial<typeof window.api> = {}) {
  ;(global as any).window.api = {
    todosListProjects: vi.fn().mockResolvedValue([]),
    ...overrides,
  }
}

describe('TodoPanel', () => {
  it('shows an empty state when there are no projects', async () => {
    mockApi()
    render(<TodoPanel />)
    await waitFor(() => {
      expect(screen.getByText('No projects yet.')).toBeInTheDocument()
    })
  })

  it('lists loaded projects by name and key', async () => {
    mockApi({
      todosListProjects: vi.fn().mockResolvedValue([
        { id: 'p1', name: 'vIDE', key: 'H', nextNumber: 1, createdAt: 1 },
      ]),
    })
    render(<TodoPanel />)
    await waitFor(() => {
      expect(screen.getByText('vIDE')).toBeInTheDocument()
      expect(screen.getByText('H')).toBeInTheDocument()
    })
  })

  it('clicking a project opens its Kanban board tab', async () => {
    mockApi({
      todosListProjects: vi.fn().mockResolvedValue([
        { id: 'p1', name: 'vIDE', key: 'H', nextNumber: 1, createdAt: 1 },
      ]),
    })
    render(<TodoPanel />)
    await waitFor(() => screen.getByText('vIDE'))
    fireEvent.click(screen.getByText('vIDE'))

    expect(openTabMock).toHaveBeenCalledWith({ path: buildTodoBoardPath('p1'), content: '', dirty: false })
  })

  it('clicking New Project opens the create-project modal', async () => {
    mockApi()
    render(<TodoPanel />)
    await waitFor(() => screen.getByText('No projects yet.'))
    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))

    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
  })
})
