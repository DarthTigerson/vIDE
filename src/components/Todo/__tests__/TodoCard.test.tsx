/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TodoCard } from '../TodoCard'
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

describe('TodoCard', () => {
  it('shows a Developer badge for a developer-authored todo', () => {
    render(
      <TodoCard todo={makeTodo({ author: 'developer' })} onOpen={vi.fn()} onDropOn={vi.fn()} onContextMenu={vi.fn()} />
    )
    expect(screen.getByText('Developer')).toBeInTheDocument()
  })

  it('shows a Claude badge for a claude-authored todo', () => {
    render(
      <TodoCard todo={makeTodo({ author: 'claude' })} onOpen={vi.fn()} onDropOn={vi.fn()} onContextMenu={vi.fn()} />
    )
    expect(screen.getByText('Claude')).toBeInTheDocument()
  })
})
