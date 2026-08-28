import { describe, it, expect } from 'vitest'
import { getProjectTags, filterTagSuggestions } from '../todoTags'
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

describe('getProjectTags', () => {
  it('collects the unique set of tags used across the given todos, alphabetically', () => {
    const todos = [
      makeTodo({ id: 'H-1', tags: ['urgent', 'frontend'] }),
      makeTodo({ id: 'H-2', tags: ['frontend', 'backend'] }),
    ]
    expect(getProjectTags(todos)).toEqual(['backend', 'frontend', 'urgent'])
  })

  it('returns an empty array when no todo has any tags', () => {
    expect(getProjectTags([makeTodo()])).toEqual([])
  })
})

describe('filterTagSuggestions', () => {
  const all = ['frontend', 'backend', 'urgent', 'Frontend-perf']

  it('matches suggestions case-insensitively by substring', () => {
    expect(filterTagSuggestions('front', all, [])).toEqual(['frontend', 'Frontend-perf'])
  })

  it('excludes tags already added', () => {
    expect(filterTagSuggestions('front', all, ['frontend'])).toEqual(['Frontend-perf'])
  })

  it('returns nothing for an empty query', () => {
    expect(filterTagSuggestions('', all, [])).toEqual([])
  })
})
