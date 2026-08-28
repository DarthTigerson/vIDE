import { TODO_LABELS } from '@/components/Todo/labels'
import type { Todo, TodoStatus } from '@/types/api'

export const TODO_COLUMNS: { status: TodoStatus; title: string }[] = [
  { status: 'backlog', title: 'Backlog' },
  { status: 'todo', title: 'Todo' },
  { status: 'in_progress', title: 'In Progress' },
  { status: 'done', title: 'Done' },
]

export function groupTodosByStatus(todos: Todo[]): Record<TodoStatus, Todo[]> {
  const groups: Record<TodoStatus, Todo[]> = { backlog: [], todo: [], in_progress: [], done: [] }
  for (const todo of todos) {
    if (!todo.archived) groups[todo.status].push(todo)
  }
  return groups
}

// Case-insensitive substring match against title/description/tags. Used to
// power the board's search box without touching stored order — like
// sortTodos, it's purely a render-time filter.
export function filterTodos(todos: Todo[], query: string): Todo[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return todos
  return todos.filter(
    (todo) =>
      todo.title.toLowerCase().includes(needle) ||
      todo.description.toLowerCase().includes(needle) ||
      todo.tags.some((tag) => tag.toLowerCase().includes(needle))
  )
}

export type TodoSortMode = 'manual' | 'id' | 'label' | 'tag'

export const TODO_SORT_MODES: { mode: TodoSortMode; title: string }[] = [
  { mode: 'manual', title: 'Manual' },
  { mode: 'id', title: 'ID' },
  { mode: 'label', title: 'Label' },
  { mode: 'tag', title: 'Tag' },
]

function idSortKey(id: string): number {
  const match = id.match(/(\d+)$/)
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY
}

function labelSortKey(label: Todo['label']): number {
  const index = label ? TODO_LABELS.indexOf(label) : -1
  return index === -1 ? TODO_LABELS.length : index
}

function tagSortKey(tags: string[]): string {
  return tags[0] ?? '￿'
}

function compareTodos(a: Todo, b: Todo, mode: Exclude<TodoSortMode, 'manual'>): number {
  switch (mode) {
    case 'id':
      return idSortKey(a.id) - idSortKey(b.id)
    case 'label':
      return labelSortKey(a.label) - labelSortKey(b.label)
    case 'tag':
      return tagSortKey(a.tags).localeCompare(tagSortKey(b.tags))
  }
}

export type TodoSortDirection = 'asc' | 'desc'

// A view-only sort: it never mutates stored order or persists anything, so
// switching back to 'manual' always restores the drag-and-drop order.
export function sortTodos(
  todos: Todo[],
  mode: TodoSortMode,
  direction: TodoSortDirection = 'asc'
): Todo[] {
  const sorted =
    mode === 'manual'
      ? todos
      : todos
          .map((todo, index) => ({ todo, index }))
          .sort((a, b) => {
            const cmp = compareTodos(a.todo, b.todo, mode)
            return cmp !== 0 ? cmp : a.index - b.index
          })
          .map((entry) => entry.todo)
  return direction === 'desc' ? [...sorted].reverse() : sorted
}
