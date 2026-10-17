import { describe, it, expect } from 'vitest'
import { mergeTodosData } from '../todosMerge'
import type { Todo, TodoProject, TodosData } from '../todosStore'

function todo(id: string, status: Todo['status'], updatedAt: number, archived = false): Todo {
  return {
    id, projectId: 'p1', title: id, description: '', attachments: [], status, archived, label: null,
    tags: [], prUrl: null, comments: [], author: 'developer', createdAt: 1, updatedAt,
  }
}

function project(nextNumber: number, extra: Partial<TodoProject> = {}): TodoProject {
  return { id: 'p1', name: 'vIDE', key: 'VIDE', nextNumber, createdAt: 1, ...extra }
}

function data(todos: Todo[], projects: TodoProject[] = [project(10)]): TodosData {
  return { projects, todos }
}

describe('mergeTodosData', () => {
  it('keeps the newer copy of a todo whichever side it is on (a stale machine cannot reopen a closed ticket)', () => {
    const stale = data([todo('VIDE-140', 'in_progress', 100)])
    const fresh = data([todo('VIDE-140', 'done', 200, true)])
    expect(mergeTodosData(fresh, stale).todos).toEqual([todo('VIDE-140', 'done', 200, true)])
    expect(mergeTodosData(stale, fresh).todos).toEqual([todo('VIDE-140', 'done', 200, true)])
  })

  it('lets b win a tie, and keeps b\'s order followed by a-only todos', () => {
    const a = data([todo('X', 'todo', 5), todo('A-only', 'todo', 1)])
    const b = data([todo('B-only', 'todo', 1), todo('X', 'backlog', 5)])
    expect(mergeTodosData(a, b).todos.map((t) => [t.id, t.status])).toEqual([
      ['B-only', 'todo'], ['X', 'backlog'], ['A-only', 'todo'],
    ])
  })

  it('never lets a board\'s next ticket number go backwards (no duplicate ids)', () => {
    const merged = mergeTodosData(data([], [project(140)]), data([], [project(139)]))
    expect(merged.projects[0].nextNumber).toBe(140)
  })

  it('keeps the newer rename or trash of a board', () => {
    const renamed = project(5, { name: 'vIDE App', updatedAt: 300 })
    const old = project(5, { name: 'vIDE', updatedAt: 100 })
    expect(mergeTodosData(data([], [renamed]), data([], [old])).projects[0].name).toBe('vIDE App')
    expect(mergeTodosData(data([], [old]), data([], [renamed])).projects[0].name).toBe('vIDE App')
  })
})
