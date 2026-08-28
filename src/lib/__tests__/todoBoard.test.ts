import { describe, it, expect } from 'vitest'
import { filterTodos, groupTodosByStatus, sortTodos, TODO_COLUMNS } from '../todoBoard'
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
    author: 'developer',
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

describe('sortTodos', () => {
  it('leaves order untouched in manual mode', () => {
    const todos = [makeTodo({ id: 'H-3' }), makeTodo({ id: 'H-1' }), makeTodo({ id: 'H-2' })]

    expect(sortTodos(todos, 'manual')).toEqual(todos)
  })

  it('sorts by the numeric id suffix ascending', () => {
    const todos = [makeTodo({ id: 'H-10' }), makeTodo({ id: 'H-2' }), makeTodo({ id: 'H-1' })]

    expect(sortTodos(todos, 'id').map((t) => t.id)).toEqual(['H-1', 'H-2', 'H-10'])
  })

  it('sorts by label in bug, feature, nice-to-have order, unlabeled last', () => {
    const todos = [
      makeTodo({ id: 'H-1', label: null }),
      makeTodo({ id: 'H-2', label: 'nice-to-have' }),
      makeTodo({ id: 'H-3', label: 'bug' }),
      makeTodo({ id: 'H-4', label: 'feature' }),
    ]

    expect(sortTodos(todos, 'label').map((t) => t.id)).toEqual(['H-3', 'H-4', 'H-2', 'H-1'])
  })

  it('sorts by first tag alphabetically, untagged last', () => {
    const todos = [
      makeTodo({ id: 'H-1', tags: [] }),
      makeTodo({ id: 'H-2', tags: ['zeta'] }),
      makeTodo({ id: 'H-3', tags: ['alpha', 'other'] }),
    ]

    expect(sortTodos(todos, 'tag').map((t) => t.id)).toEqual(['H-3', 'H-2', 'H-1'])
  })

  it('keeps equal-key todos in their original relative order (stable sort)', () => {
    const todos = [
      makeTodo({ id: 'H-1', label: 'bug' }),
      makeTodo({ id: 'H-2', label: 'bug' }),
    ]

    expect(sortTodos(todos, 'label').map((t) => t.id)).toEqual(['H-1', 'H-2'])
  })

  it('reverses the sorted result when direction is desc', () => {
    const todos = [makeTodo({ id: 'H-1' }), makeTodo({ id: 'H-2' }), makeTodo({ id: 'H-3' })]

    expect(sortTodos(todos, 'id', 'desc').map((t) => t.id)).toEqual(['H-3', 'H-2', 'H-1'])
  })

  it('reverses manual order too when direction is desc', () => {
    const todos = [makeTodo({ id: 'H-1' }), makeTodo({ id: 'H-2' }), makeTodo({ id: 'H-3' })]

    expect(sortTodos(todos, 'manual', 'desc').map((t) => t.id)).toEqual(['H-3', 'H-2', 'H-1'])
  })
})

describe('filterTodos', () => {
  it('returns everything for an empty or whitespace-only query', () => {
    const todos = [makeTodo({ id: 'H-1' }), makeTodo({ id: 'H-2' })]
    expect(filterTodos(todos, '')).toEqual(todos)
    expect(filterTodos(todos, '   ')).toEqual(todos)
  })

  it('matches a substring of the title, case-insensitively', () => {
    const todos = [
      makeTodo({ id: 'H-1', title: 'Fix login bug' }),
      makeTodo({ id: 'H-2', title: 'Ship feature' }),
    ]
    expect(filterTodos(todos, 'LOGIN').map((t) => t.id)).toEqual(['H-1'])
  })

  it('matches a substring of the description', () => {
    const todos = [
      makeTodo({ id: 'H-1', title: 'Fix bug', description: 'crashes on startup' }),
      makeTodo({ id: 'H-2', title: 'Ship feature', description: 'nothing to see here' }),
    ]
    expect(filterTodos(todos, 'startup').map((t) => t.id)).toEqual(['H-1'])
  })

  it('matches a substring of any tag, case-insensitively', () => {
    const todos = [
      makeTodo({ id: 'H-1', title: 'Fix bug', tags: ['frontend', 'urgent'] }),
      makeTodo({ id: 'H-2', title: 'Ship feature', tags: ['backend'] }),
    ]
    expect(filterTodos(todos, 'FRONT').map((t) => t.id)).toEqual(['H-1'])
  })

  it('returns an empty array when nothing matches', () => {
    const todos = [makeTodo({ id: 'H-1', title: 'Fix bug' })]
    expect(filterTodos(todos, 'nonexistent')).toEqual([])
  })
})
