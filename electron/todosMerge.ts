import type { Todo, TodoProject, TodosData } from './todosStore'

// vIDE Sync's todo merge. Additive (an item on only one side is kept, so
// deletions don't propagate), and for an item on both sides the most recently
// updated copy wins, whichever machine it came from; ties go to b. Order
// follows b, then a-only items. Picking a side instead of the newer copy let
// a machine holding stale todos reopen closed tickets on every push.
export function mergeTodosData(a: TodosData, b: TodosData): TodosData {
  return {
    projects: mergeById(a.projects, b.projects, mergeProject),
    todos: mergeById(a.todos, b.todos, newerTodo),
  }
}

function mergeById<T extends { id: string }>(a: T[], b: T[], pick: (fromA: T, fromB: T) => T): T[] {
  const aById = new Map(a.map((item) => [item.id, item]))
  const bIds = new Set(b.map((item) => item.id))
  return [
    ...b.map((item) => {
      const other = aById.get(item.id)
      return other ? pick(other, item) : item
    }),
    ...a.filter((item) => !bIds.has(item.id)),
  ]
}

function newerTodo(fromA: Todo, fromB: Todo): Todo {
  return fromA.updatedAt > fromB.updatedAt ? fromA : fromB
}

// A board's name/key/Trash state follows its newer copy (updatedAt; boards
// written before it existed count as 0). nextNumber always takes the higher
// side: a lower one would hand out a ticket id that's already in use.
function mergeProject(fromA: TodoProject, fromB: TodoProject): TodoProject {
  const newer = (fromA.updatedAt ?? 0) > (fromB.updatedAt ?? 0) ? fromA : fromB
  return { ...newer, nextNumber: Math.max(fromA.nextNumber, fromB.nextNumber) }
}
