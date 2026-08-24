import { create } from 'zustand'
import type { Todo, TodoProject, TodoStatus, TodoUpdatePatch } from '@/types/api'

// A stable reference for "no todos loaded yet" — selectors must never
// fall back to a fresh `[]` literal, since a new array on every call
// breaks useSyncExternalStore's referential-equality check and spins
// into "Maximum update depth exceeded".
export const EMPTY_TODOS: Todo[] = []

function replaceInBucket(
  todosByProject: Record<string, Todo[]>,
  updated: Todo
): Record<string, Todo[]> {
  const bucket = todosByProject[updated.projectId]
  if (!bucket) return todosByProject
  return {
    ...todosByProject,
    [updated.projectId]: bucket.map((t) => (t.id === updated.id ? updated : t)),
  }
}

interface TodoStore {
  projects: TodoProject[]
  todosByProject: Record<string, Todo[]>
  loadProjects: () => Promise<void>
  createProject: (name: string, key: string) => Promise<TodoProject>
  loadTodos: (projectId: string) => Promise<void>
  createTodo: (projectId: string, title: string) => Promise<Todo>
  updateTodo: (id: string, patch: TodoUpdatePatch) => Promise<Todo>
  reorderTodo: (
    projectId: string,
    id: string,
    status: TodoStatus,
    beforeId: string | null
  ) => Promise<void>
  archiveTodo: (id: string, archived: boolean) => Promise<Todo>
  deleteTodo: (id: string) => Promise<void>
  addComment: (todoId: string, body: string, attachments?: string[]) => Promise<Todo>
  saveAttachment: (dataUrl: string) => Promise<string>
}

export const useTodoStore = create<TodoStore>((set, get) => ({
  projects: [],
  todosByProject: {},

  loadProjects: async () => {
    const projects = await window.api.todosListProjects()
    set({ projects })
  },

  createProject: async (name, key) => {
    const project = await window.api.todosCreateProject(name, key)
    set({ projects: [...get().projects, project] })
    return project
  },

  loadTodos: async (projectId) => {
    const todos = await window.api.todosListTodos(projectId)
    set({ todosByProject: { ...get().todosByProject, [projectId]: todos } })
  },

  createTodo: async (projectId, title) => {
    const todo = await window.api.todosCreateTodo(projectId, title)
    const bucket = get().todosByProject[projectId] ?? []
    set({ todosByProject: { ...get().todosByProject, [projectId]: [...bucket, todo] } })
    return todo
  },

  updateTodo: async (id, patch) => {
    const updated = await window.api.todosUpdateTodo(id, patch)
    set({ todosByProject: replaceInBucket(get().todosByProject, updated) })
    return updated
  },

  reorderTodo: async (projectId, id, status, beforeId) => {
    const bucket = get().todosByProject[projectId] ?? []
    const todo = bucket.find((t) => t.id === id)
    if (todo) {
      const rest = bucket.filter((t) => t.id !== id)
      const moved = { ...todo, status }
      const insertAt = beforeId ? rest.findIndex((t) => t.id === beforeId) : -1
      const reordered =
        insertAt === -1 ? [...rest, moved] : [...rest.slice(0, insertAt), moved, ...rest.slice(insertAt)]
      set({ todosByProject: { ...get().todosByProject, [projectId]: reordered } })
    }
    await window.api.todosReorderTodo(id, status, beforeId)
  },

  archiveTodo: async (id, archived) => {
    const updated = await window.api.todosArchiveTodo(id, archived)
    set({ todosByProject: replaceInBucket(get().todosByProject, updated) })
    return updated
  },

  deleteTodo: async (id) => {
    await window.api.todosDeleteTodo(id)
    const todosByProject = Object.fromEntries(
      Object.entries(get().todosByProject).map(([projectId, todos]) => [
        projectId,
        todos.filter((t) => t.id !== id),
      ])
    )
    set({ todosByProject })
  },

  addComment: async (todoId, body, attachments) => {
    const updated = await window.api.todosAddComment(todoId, body, attachments)
    set({ todosByProject: replaceInBucket(get().todosByProject, updated) })
    return updated
  },

  saveAttachment: async (dataUrl) => window.api.todosSaveAttachment(dataUrl),
}))
