import { describe, it, expect } from 'vitest'
import { groupTodosByStatus, TODO_COLUMNS } from '../todoBoard'
import type { Todo } from '@/types/api'

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

describe('TODO_COLUMNS', () => {
  it('lists the four board columns in board order', () => {
    expect(TODO_COLUMNS.map((c) => c.status)).toEqual(['backlog', 'todo', 'in_progress', 'done'])
  })
})

describe('groupTodosByStatus', () => {
  it('buckets todos under their status', () => {
    const todos = [
      makeTodo({ id: 'H-1', status: 'backlog' }),
      makeTodo({ id: 'H-2', status: 'in_progress' }),
      makeTodo({ id: 'H-3', status: 'backlog' }),
    ]

    const groups = groupTodosByStatus(todos)

    expect(groups.backlog.map((t) => t.id)).toEqual(['H-1', 'H-3'])
    expect(groups.in_progress.map((t) => t.id)).toEqual(['H-2'])
    expect(groups.todo).toEqual([])
    expect(groups.done).toEqual([])
  })

  it('excludes archived todos from every bucket', () => {
    const todos = [makeTodo({ id: 'H-1', status: 'done', archived: true })]

    const groups = groupTodosByStatus(todos)

    expect(groups.done).toEqual([])
  })
})
