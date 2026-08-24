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
