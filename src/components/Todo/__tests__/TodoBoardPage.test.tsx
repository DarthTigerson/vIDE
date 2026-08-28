/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { TodoBoardPage } from '../TodoBoardPage'
import { useTodoStore } from '@/stores/todoStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildTodoDetailPath } from '@/components/Settings/paths'
import type { Todo, TodoProject } from '@/types/api'

afterEach(() => {
  cleanup()
})

// jsdom's synthetic DragEvent doesn't carry MouseEvent fields like clientY
// through fireEvent.drop's event-map, so it always reads as `undefined`.
// Building the event manually and assigning the fields we need keeps the
// card-level before/after placement math under test.
function fireDrop(el: Element, clientY: number, draggedId: string) {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.assign(event, { clientY, dataTransfer: { getData: () => draggedId } })
  fireEvent(el, event)
}

const project: TodoProject = { id: 'p1', name: 'vIDE', key: 'H', nextNumber: 3, createdAt: 1 }

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
const createTodoMock = vi.fn()
const updateTodoMock = vi.fn()
const reorderTodoMock = vi.fn()
const archiveTodoMock = vi.fn()
const openTabMock = vi.fn()

beforeEach(() => {
  loadTodosMock.mockReset()
  createTodoMock.mockReset().mockResolvedValue(makeTodo({ id: 'H-4', title: 'New one' }))
  updateTodoMock.mockReset().mockResolvedValue(makeTodo())
  reorderTodoMock.mockReset().mockResolvedValue(undefined)
  archiveTodoMock.mockReset().mockResolvedValue(makeTodo())
  openTabMock.mockReset()
  useTodoStore.setState({
    projects: [project],
    boardViewByProject: {},
    todosByProject: {
      p1: [
        makeTodo({ id: 'H-1', title: 'Fix bug', status: 'backlog' }),
        makeTodo({ id: 'H-2', title: 'Ship feature', status: 'in_progress' }),
        makeTodo({ id: 'H-3', title: 'Old and done', status: 'done', archived: true }),
      ],
    },
    loadTodos: loadTodosMock,
    createTodo: createTodoMock,
    updateTodo: updateTodoMock,
    reorderTodo: reorderTodoMock,
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
    expect(screen.getByText('vIDE')).toBeInTheDocument()
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

  it('clicking a card opens its detail page as a tab', () => {
    render(<TodoBoardPage projectId="p1" />)
    fireEvent.click(screen.getByText('Fix bug'))
    expect(openTabMock).toHaveBeenCalledWith({
      path: buildTodoDetailPath('p1', 'H-1'),
      content: '',
      dirty: false,
    })
  })

  it('keeps the archive view selected across a remount of the same project (e.g. returning from a detail tab)', () => {
    const { unmount } = render(<TodoBoardPage projectId="p1" />)
    fireEvent.click(screen.getByLabelText('Archive'))
    expect(screen.getByText('Old and done')).toBeInTheDocument()

    // Editor.tsx only mounts the active tab's page - opening a todo detail
    // tab unmounts TodoBoardPage entirely, then remounts it on return.
    unmount()
    render(<TodoBoardPage projectId="p1" />)

    expect(screen.getByText('Old and done')).toBeInTheDocument()
    expect(screen.queryByText('Fix bug')).not.toBeInTheDocument()
  })

  it('dropping a card onto empty column space appends it to the end of that column', () => {
    render(<TodoBoardPage projectId="p1" />)
    const doneColumn = screen.getByText('Done').closest('div')!.parentElement!
    fireEvent.drop(doneColumn, { dataTransfer: { getData: () => 'H-1' } })
    expect(reorderTodoMock).toHaveBeenCalledWith('p1', 'H-1', 'done', null)
  })

  it('dropping a card onto the top half of another card reorders it before that card', () => {
    render(<TodoBoardPage projectId="p1" />)
    fireDrop(screen.getByText('Ship feature'), -5, 'H-1')
    expect(reorderTodoMock).toHaveBeenCalledWith('p1', 'H-1', 'in_progress', 'H-2')
  })

  it('dropping a card onto the bottom half of the last card in a column appends it there', () => {
    render(<TodoBoardPage projectId="p1" />)
    fireDrop(screen.getByText('Ship feature'), 5, 'H-1')
    expect(reorderTodoMock).toHaveBeenCalledWith('p1', 'H-1', 'in_progress', null)
  })

  it('clicking "+ Add issue" in a column reveals an inline title input', () => {
    render(<TodoBoardPage projectId="p1" />)
    const backlogAdd = screen.getAllByRole('button', { name: '+ Add issue' })[0]
    fireEvent.click(backlogAdd)
    expect(screen.getByPlaceholderText('What needs to be done?')).toBeInTheDocument()
  })

  it('typing a title and pressing Enter creates the todo in that column and keeps the composer open', async () => {
    render(<TodoBoardPage projectId="p1" />)
    fireEvent.click(screen.getAllByRole('button', { name: '+ Add issue' })[2]) // In Progress column
    const input = screen.getByPlaceholderText('What needs to be done?')
    fireEvent.change(input, { target: { value: 'New one' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(createTodoMock).toHaveBeenCalledWith('p1', 'New one')
      expect(updateTodoMock).toHaveBeenCalledWith('H-4', { status: 'in_progress' })
    })
    expect(screen.getByPlaceholderText('What needs to be done?')).toHaveValue('')
  })

  it('pressing Enter with an empty title does not create a todo', () => {
    render(<TodoBoardPage projectId="p1" />)
    fireEvent.click(screen.getAllByRole('button', { name: '+ Add issue' })[0])
    fireEvent.keyDown(screen.getByPlaceholderText('What needs to be done?'), { key: 'Enter' })
    expect(createTodoMock).not.toHaveBeenCalled()
  })

  it('pressing Escape closes the composer without creating a todo', () => {
    render(<TodoBoardPage projectId="p1" />)
    fireEvent.click(screen.getAllByRole('button', { name: '+ Add issue' })[0])
    fireEvent.keyDown(screen.getByPlaceholderText('What needs to be done?'), { key: 'Escape' })
    expect(screen.queryByPlaceholderText('What needs to be done?')).not.toBeInTheDocument()
    expect(createTodoMock).not.toHaveBeenCalled()
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
