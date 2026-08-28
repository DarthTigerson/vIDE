/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { TodoDetailPage } from '../TodoDetailPage'
import { useTodoStore } from '@/stores/todoStore'
import type { Todo } from '@/types/api'

afterEach(() => {
  cleanup()
})

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'H-1',
    projectId: 'p1',
    title: 'Fix bug',
    description: 'Something is broken',
    attachments: [],
    status: 'backlog',
    archived: false,
    label: null,
    tags: [],
    prUrl: null,
    comments: [],
    author: 'developer',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

const updateTodoMock = vi.fn()
const archiveTodoMock = vi.fn()
const addCommentMock = vi.fn()
const saveAttachmentMock = vi.fn()

beforeEach(() => {
  updateTodoMock.mockReset().mockResolvedValue(makeTodo())
  archiveTodoMock.mockReset().mockResolvedValue(makeTodo({ archived: true }))
  addCommentMock.mockReset().mockResolvedValue(makeTodo())
  saveAttachmentMock.mockReset().mockResolvedValue('att-1')
  useTodoStore.setState({
    todosByProject: { p1: [makeTodo()] },
    projects: [{ id: 'p1', name: 'vIDE', key: 'HG', nextNumber: 2, createdAt: 1 }],
    updateTodo: updateTodoMock,
    archiveTodo: archiveTodoMock,
    addComment: addCommentMock,
    saveAttachment: saveAttachmentMock,
  })
  ;(global as any).window.api = {
    todosReadAttachmentDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,AAA'),
  }
})

describe('TodoDetailPage', () => {
  it('saves the title on blur when it changed', () => {
    render(<TodoDetailPage projectId="p1" todoId="H-1" />)
    const titleInput = screen.getByLabelText('Title')
    fireEvent.change(titleInput, { target: { value: 'Fix the real bug' } })
    fireEvent.blur(titleInput)
    expect(updateTodoMock).toHaveBeenCalledWith('H-1', { title: 'Fix the real bug' })
  })

  it('does not call updateTodo on blur when the title is unchanged', () => {
    render(<TodoDetailPage projectId="p1" todoId="H-1" />)
    const titleInput = screen.getByLabelText('Title')
    fireEvent.blur(titleInput)
    expect(updateTodoMock).not.toHaveBeenCalled()
  })

  it('selecting a label calls updateTodo with the single label', () => {
    render(<TodoDetailPage projectId="p1" todoId="H-1" />)
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'bug' } })
    expect(updateTodoMock).toHaveBeenCalledWith('H-1', { label: 'bug' })
  })

  it('selecting "No label" clears an already-applied label', () => {
    useTodoStore.setState({ todosByProject: { p1: [makeTodo({ label: 'bug' })] } })
    render(<TodoDetailPage projectId="p1" todoId="H-1" />)
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: '' } })
    expect(updateTodoMock).toHaveBeenCalledWith('H-1', { label: null })
  })

  it('changing the status calls updateTodo with the new status', () => {
    render(<TodoDetailPage projectId="p1" todoId="H-1" />)
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'done' } })
    expect(updateTodoMock).toHaveBeenCalledWith('H-1', { status: 'done' })
  })

  it('saves the PR/MR URL on blur', () => {
    render(<TodoDetailPage projectId="p1" todoId="H-1" />)
    const urlInput = screen.getByLabelText('PR/MR URL')
    fireEvent.change(urlInput, { target: { value: 'https://github.com/org/repo/pull/1' } })
    fireEvent.blur(urlInput)
    expect(updateTodoMock).toHaveBeenCalledWith('H-1', { prUrl: 'https://github.com/org/repo/pull/1' })
  })

  it('adds a comment and clears the input', async () => {
    render(<TodoDetailPage projectId="p1" todoId="H-1" />)
    fireEvent.change(screen.getByLabelText('New comment'), { target: { value: 'Looks good' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }))

    await waitFor(() => {
      expect(addCommentMock).toHaveBeenCalledWith('H-1', 'Looks good', [])
    })
    expect(screen.getByLabelText('New comment')).toHaveValue('')
  })

  it('renders existing comments', () => {
    useTodoStore.setState({
      todosByProject: {
        p1: [
          makeTodo({
            comments: [{ id: 'c1', body: 'already here', attachments: [], author: 'developer', createdAt: 2 }],
          }),
        ],
      },
    })
    render(<TodoDetailPage projectId="p1" todoId="H-1" />)
    expect(screen.getByText('already here')).toBeInTheDocument()
  })

  it('shows the author badge for the todo and each comment', () => {
    useTodoStore.setState({
      todosByProject: {
        p1: [
          makeTodo({
            author: 'claude',
            comments: [{ id: 'c1', body: 'already here', attachments: [], author: 'developer', createdAt: 2 }],
          }),
        ],
      },
    })
    render(<TodoDetailPage projectId="p1" todoId="H-1" />)
    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('Developer')).toBeInTheDocument()
  })

  it('archives the todo', () => {
    render(<TodoDetailPage projectId="p1" todoId="H-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(archiveTodoMock).toHaveBeenCalledWith('H-1', true)
  })

  it('unarchives an already-archived todo', () => {
    useTodoStore.setState({ todosByProject: { p1: [makeTodo({ archived: true })] } })
    render(<TodoDetailPage projectId="p1" todoId="H-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Unarchive' }))
    expect(archiveTodoMock).toHaveBeenCalledWith('H-1', false)
  })

  it('shows the project name before the todo id in the breadcrumb', () => {
    render(<TodoDetailPage projectId="p1" todoId="H-1" />)
    expect(screen.getByText('vIDE')).toBeInTheDocument()
    expect(screen.getByText('H-1')).toBeInTheDocument()
  })

  it('falls back to "Todo" in the breadcrumb when the project cannot be found', () => {
    useTodoStore.setState({ projects: [] })
    render(<TodoDetailPage projectId="p1" todoId="H-1" />)
    expect(screen.getByText('Todo', { selector: 'span' })).toBeInTheDocument()
  })

  it('does not render Delete or Close controls', () => {
    render(<TodoDetailPage projectId="p1" todoId="H-1" />)
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  it('adding a tag calls updateTodo with the new tags array', () => {
    render(<TodoDetailPage projectId="p1" todoId="H-1" />)
    const input = screen.getByLabelText('Tags')
    fireEvent.change(input, { target: { value: 'frontend' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(updateTodoMock).toHaveBeenCalledWith('H-1', { tags: ['frontend'] })
  })

  it('suggests tags already used elsewhere in the same project', () => {
    useTodoStore.setState({
      todosByProject: { p1: [makeTodo(), makeTodo({ id: 'H-2', tags: ['frontend'] })] },
    })
    render(<TodoDetailPage projectId="p1" todoId="H-1" />)
    fireEvent.change(screen.getByLabelText('Tags'), { target: { value: 'front' } })

    expect(screen.getByRole('button', { name: 'frontend' })).toBeInTheDocument()
  })

  it('pasting an image into the description uploads it and adds it to the todo’s attachments', async () => {
    render(<TodoDetailPage projectId="p1" todoId="H-1" />)
    const file = new File(['fake'], 'shot.png', { type: 'image/png' })
    fireEvent.paste(screen.getByLabelText('Description'), {
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] },
    })

    await waitFor(() => {
      expect(saveAttachmentMock).toHaveBeenCalled()
      expect(updateTodoMock).toHaveBeenCalledWith('H-1', { attachments: ['att-1'] })
    })
  })

  it('does not crash when the todo cannot be found yet', () => {
    useTodoStore.setState({ todosByProject: {} })
    expect(() => render(<TodoDetailPage projectId="p1" todoId="H-1" />)).not.toThrow()
  })
})
