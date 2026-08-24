/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TodoArchiveList } from '../TodoArchiveList'
import type { Todo } from '@/types/api'

afterEach(() => {
  cleanup()
})

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'H-1',
    projectId: 'p1',
    title: 'Fix bug',
    description: '',
    attachments: [],
    status: 'done',
    archived: true,
    label: null,
    tags: [],
    prUrl: null,
    comments: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('TodoArchiveList', () => {
  it('shows an empty state when there are no archived todos', () => {
    render(<TodoArchiveList todos={[]} onOpen={vi.fn()} onUnarchive={vi.fn()} />)
    expect(screen.getByText('No archived todos.')).toBeInTheDocument()
  })

  it('lists each archived todo by id and title', () => {
    render(
      <TodoArchiveList
        todos={[makeTodo({ id: 'H-1', title: 'Fix bug' }), makeTodo({ id: 'H-2', title: 'Ship feature' })]}
        onOpen={vi.fn()}
        onUnarchive={vi.fn()}
      />
    )
    expect(screen.getByText('H-1')).toBeInTheDocument()
    expect(screen.getByText('Fix bug')).toBeInTheDocument()
    expect(screen.getByText('H-2')).toBeInTheDocument()
    expect(screen.getByText('Ship feature')).toBeInTheDocument()
  })

  it('clicking a row title calls onOpen with its id', () => {
    const onOpen = vi.fn()
    render(<TodoArchiveList todos={[makeTodo({ id: 'H-1', title: 'Fix bug' })]} onOpen={onOpen} onUnarchive={vi.fn()} />)
    fireEvent.click(screen.getByText('Fix bug'))
    expect(onOpen).toHaveBeenCalledWith('H-1')
  })

  it('clicking Unarchive calls onUnarchive with its id, not onOpen', () => {
    const onOpen = vi.fn()
    const onUnarchive = vi.fn()
    render(<TodoArchiveList todos={[makeTodo({ id: 'H-1', title: 'Fix bug' })]} onOpen={onOpen} onUnarchive={onUnarchive} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unarchive' }))
    expect(onUnarchive).toHaveBeenCalledWith('H-1')
    expect(onOpen).not.toHaveBeenCalled()
  })
})
