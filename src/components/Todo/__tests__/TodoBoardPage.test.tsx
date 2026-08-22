/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TodoBoardPage } from '../TodoBoardPage'
import { useTodoStore } from '@/stores/todoStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildTodoDetailPath, buildTodoNewPath } from '@/components/Settings/paths'
import type { Todo, TodoProject } from '@/types/api'

afterEach(() => {
  cleanup()
})

const project: TodoProject = { id: 'p1', name: 'Huginn', key: 'H', nextNumber: 3, createdAt: 1 }

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'H-1',
    projectId: 'p1',
    title: 'Fix bug',
    description: '',
    attachments: [],
    status: 'backlog',
    archived: false,
    label: null,
    tags: [],
    prUrl: null,
    comments: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

const loadTodosMock = vi.fn()
const updateTodoMock = vi.fn()
const archiveTodoMock = vi.fn()
const openTabMock = vi.fn()

beforeEach(() => {
  loadTodosMock.mockReset()
  updateTodoMock.mockReset().mockResolvedValue(makeTodo())
  archiveTodoMock.mockReset().mockResolvedValue(makeTodo())
  openTabMock.mockReset()
  useTodoStore.setState({
    projects: [project],
    todosByProject: {
      p1: [
        makeTodo({ id: 'H-1', title: 'Fix bug', status: 'backlog' }),
        makeTodo({ id: 'H-2', title: 'Ship feature', status: 'in_progress' }),
        makeTodo({ id: 'H-3', title: 'Old and done', status: 'done', archived: true }),
      ],
    },
    loadTodos: loadTodosMock,
    updateTodo: updateTodoMock,
    archiveTodo: archiveTodoMock,
  })
  useEditorStore.setState({ openTab: openTabMock })
  ;(global as any).window.api = {
    todosReadAttachmentDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,AAA'),
  }
})

describe('TodoBoardPage', () => {
  it('loads todos for the project on mount', () => {
    render(<TodoBoardPage projectId="p1" />)
    expect(loadTodosMock).toHaveBeenCalledWith('p1')
  })

  it('shows the project name in the header', () => {
    render(<TodoBoardPage projectId="p1" />)
    expect(screen.getByText('Huginn')).toBeInTheDocument()
  })

  it('places each non-archived todo under its status column', () => {
    render(<TodoBoardPage projectId="p1" />)
    expect(screen.getByText('Fix bug')).toBeInTheDocument()
    expect(screen.getByText('Ship feature')).toBeInTheDocument()
    expect(screen.queryByText('Old and done')).not.toBeInTheDocument()
  })

  it('renders tag chips on a card that has tags', () => {
    useTodoStore.setState({
      todosByProject: { p1: [makeTodo({ id: 'H-1', title: 'Fix bug', tags: ['frontend', 'urgent'] })] },
    })
    render(<TodoBoardPage projectId="p1" />)
    expect(screen.getByText('frontend')).toBeInTheDocument()
    expect(screen.getByText('urgent')).toBeInTheDocument()
  })

  it('the floating New todo button opens the new-todo page as a tab', () => {
    render(<TodoBoardPage projectId="p1" />)
    fireEvent.click(screen.getByRole('button', { name: 'New todo' }))

    expect(openTabMock).toHaveBeenCalledWith({ path: buildTodoNewPath('p1'), content: '', dirty: false })
  })

  it('clicking a card opens its detail page as a tab', () => {
    render(<TodoBoardPage projectId="p1" />)
    fireEvent.click(screen.getByText('Fix bug'))
    expect(openTabMock).toHaveBeenCalledWith({
      path: buildTodoDetailPath('p1', 'H-1'),
      content: '',
      dirty: false,
    })
  })

  it('dropping a card onto another column calls updateTodo with that column status', () => {
    render(<TodoBoardPage projectId="p1" />)
    const doneColumn = screen.getByText('Done').closest('div')!.parentElement!
    fireEvent.drop(doneColumn, { dataTransfer: { getData: () => 'H-1' } })
    expect(updateTodoMock).toHaveBeenCalledWith('H-1', { status: 'done' })
  })

  it('switching to Archive view shows archived todos instead of the board', () => {
    render(<TodoBoardPage projectId="p1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))

    expect(screen.getByText('Old and done')).toBeInTheDocument()
    expect(screen.queryByText('Fix bug')).not.toBeInTheDocument()
  })

  it('opening an archived todo opens its detail page as a tab', () => {
    render(<TodoBoardPage projectId="p1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    fireEvent.click(screen.getByText('Old and done'))

    expect(openTabMock).toHaveBeenCalledWith({
      path: buildTodoDetailPath('p1', 'H-3'),
      content: '',
      dirty: false,
    })
  })

  it('does not crash when opening a project that has no todosByProject entry yet', () => {
    useTodoStore.setState({ projects: [project], todosByProject: {} })
    expect(() => render(<TodoBoardPage projectId="p1" />)).not.toThrow()
  })
})
