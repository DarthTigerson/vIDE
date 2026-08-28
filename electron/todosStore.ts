import { join } from 'path'
import { mkdir, readFile, writeFile, rm } from 'fs/promises'

export type TodoStatus = 'backlog' | 'todo' | 'in_progress' | 'done'
export type TodoLabel = 'bug' | 'feature' | 'nice-to-have'
// Who created this todo/comment — stamped structurally by the path that
// created it (UI vs. the MCP server), never a free-text/self-reported value.
export type TodoAuthor = 'developer' | 'claude'

export interface TodoProject {
  id: string
  name: string
  key: string
  nextNumber: number
  createdAt: number
}

export interface TodoComment {
  id: string
  body: string
  attachments: string[]
  author: TodoAuthor
  createdAt: number
}

export interface Todo {
  id: string
  projectId: string
  title: string
  description: string
  attachments: string[]
  status: TodoStatus
  archived: boolean
  label: TodoLabel | null
  tags: string[]
  prUrl: string | null
  comments: TodoComment[]
  author: TodoAuthor
  createdAt: number
  updatedAt: number
}

export interface TodosData {
  projects: TodoProject[]
  todos: Todo[]
}

export function todosPath(dataDir: string): string {
  return join(dataDir, 'todos.json')
}

export function attachmentsDir(dataDir: string): string {
  return join(dataDir, 'todos-attachments')
}

export interface ActiveTodoMarker {
  id: string
  startedAt: number
  commentLogged: boolean
}

function activeTodoPath(dataDir: string): string {
  return join(dataDir, 'active-todo.json')
}

export async function readActiveTodo(dataDir: string): Promise<ActiveTodoMarker | null> {
  try {
    const data = await readFile(activeTodoPath(dataDir), 'utf-8')
    const parsed = JSON.parse(data) as Partial<ActiveTodoMarker>
    if (typeof parsed?.id !== 'string') return null
    return parsed as ActiveTodoMarker
  } catch {
    return null
  }
}

async function writeActiveTodo(dataDir: string, marker: ActiveTodoMarker | null): Promise<void> {
  if (marker === null) {
    await rm(activeTodoPath(dataDir), { force: true })
    return
  }
  await mkdir(dataDir, { recursive: true })
  await writeFile(activeTodoPath(dataDir), JSON.stringify(marker), 'utf-8')
}

async function clearActiveTodoIfMatches(dataDir: string, id: string): Promise<void> {
  const active = await readActiveTodo(dataDir)
  if (active && active.id === id) await writeActiveTodo(dataDir, null)
}

export async function readTodosData(dataDir: string): Promise<TodosData> {
  try {
    const data = await readFile(todosPath(dataDir), 'utf-8')
    const parsed = JSON.parse(data) as { projects: TodoProject[]; todos: unknown[] }
    return { projects: parsed.projects, todos: parsed.todos.map(normalizeTodo) }
  } catch {
    return { projects: [], todos: [] }
  }
}

// Migrates records persisted under an older shape so old data doesn't crash
// consumers that assume the current Todo shape. Self-heals on the next write.
function normalizeTodo(raw: unknown): Todo {
  const { labels, ...todo } = raw as Todo & { labels?: TodoLabel[] }
  return {
    ...todo,
    tags: todo.tags ?? [],
    label: todo.label !== undefined ? todo.label : (labels?.[0] ?? null),
    author: todo.author ?? 'developer',
    comments: (todo.comments ?? []).map((c) => ({ ...c, author: c.author ?? 'developer' })),
  }
}

export async function writeTodosData(dataDir: string, data: TodosData): Promise<void> {
  await mkdir(dataDir, { recursive: true })
  await writeFile(todosPath(dataDir), JSON.stringify(data), 'utf-8')
}

export async function listProjects(dataDir: string): Promise<TodoProject[]> {
  const data = await readTodosData(dataDir)
  return data.projects
}

export async function createProject(dataDir: string, name: string, key: string): Promise<TodoProject> {
  const trimmedKey = key.trim()
  if (!trimmedKey) throw new Error('Project key is required')

  const data = await readTodosData(dataDir)
  if (data.projects.some((p) => p.key.toLowerCase() === trimmedKey.toLowerCase())) {
    throw new Error(`A project with key "${trimmedKey}" already exists`)
  }

  const project: TodoProject = {
    id: crypto.randomUUID(),
    name,
    key: trimmedKey,
    nextNumber: 1,
    createdAt: Date.now(),
  }
  data.projects.push(project)
  await writeTodosData(dataDir, data)
  return project
}

export async function listTodos(dataDir: string, projectId: string): Promise<Todo[]> {
  const data = await readTodosData(dataDir)
  return data.todos.filter((t) => t.projectId === projectId)
}

export async function createTodo(
  dataDir: string,
  projectId: string,
  title: string,
  author: TodoAuthor = 'developer'
): Promise<Todo> {
  const data = await readTodosData(dataDir)
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) throw new Error(`No such project: ${projectId}`)

  const now = Date.now()
  const todo: Todo = {
    id: `${project.key}-${project.nextNumber}`,
    projectId,
    title,
    description: '',
    attachments: [],
    status: 'backlog',
    archived: false,
    label: null,
    tags: [],
    prUrl: null,
    comments: [],
    author,
    createdAt: now,
    updatedAt: now,
  }
  project.nextNumber += 1
  data.todos.push(todo)
  await writeTodosData(dataDir, data)
  return todo
}

// Marks a ticket as the one Claude is actively working, for the
// vide-todo-enforcer plugin's Stop hook to key its enforcement off of. See
// docs/superpowers/specs/2026-08-28-todo-enforcement-plugin-design.md.
export async function startTodo(dataDir: string, id: string): Promise<Todo> {
  const todo = await updateTodo(dataDir, id, { status: 'in_progress' })
  await writeActiveTodo(dataDir, { id, startedAt: Date.now(), commentLogged: false })
  return todo
}

export type TodoPatch = Partial<
  Pick<Todo, 'title' | 'description' | 'attachments' | 'status' | 'label' | 'tags' | 'prUrl'>
>

export async function updateTodo(dataDir: string, id: string, patch: TodoPatch): Promise<Todo> {
  const data = await readTodosData(dataDir)
  const todo = data.todos.find((t) => t.id === id)
  if (!todo) throw new Error(`No such todo: ${id}`)

  Object.assign(todo, patch, { updatedAt: Date.now() })
  await writeTodosData(dataDir, data)

  if (patch.status !== undefined && patch.status !== 'in_progress') {
    await clearActiveTodoIfMatches(dataDir, id)
  }

  return todo
}

export async function reorderTodo(
  dataDir: string,
  id: string,
  status: TodoStatus,
  beforeId: string | null
): Promise<Todo> {
  const data = await readTodosData(dataDir)
  const index = data.todos.findIndex((t) => t.id === id)
  if (index === -1) throw new Error(`No such todo: ${id}`)

  const [todo] = data.todos.splice(index, 1)
  todo.status = status
  todo.updatedAt = Date.now()

  const insertAt = beforeId ? data.todos.findIndex((t) => t.id === beforeId) : -1
  if (insertAt === -1) {
    data.todos.push(todo)
  } else {
    data.todos.splice(insertAt, 0, todo)
  }

  await writeTodosData(dataDir, data)
  if (status !== 'in_progress') await clearActiveTodoIfMatches(dataDir, id)
  return todo
}

export async function archiveTodo(dataDir: string, id: string, archived: boolean): Promise<Todo> {
  const data = await readTodosData(dataDir)
  const todo = data.todos.find((t) => t.id === id)
  if (!todo) throw new Error(`No such todo: ${id}`)

  todo.archived = archived
  todo.updatedAt = Date.now()
  await writeTodosData(dataDir, data)
  if (archived) await clearActiveTodoIfMatches(dataDir, id)
  return todo
}

export async function deleteTodo(dataDir: string, id: string): Promise<void> {
  const data = await readTodosData(dataDir)
  data.todos = data.todos.filter((t) => t.id !== id)
  await writeTodosData(dataDir, data)
  await clearActiveTodoIfMatches(dataDir, id)
}

export async function addComment(
  dataDir: string,
  todoId: string,
  body: string,
  attachments: string[] = [],
  author: TodoAuthor = 'developer'
): Promise<Todo> {
  const data = await readTodosData(dataDir)
  const todo = data.todos.find((t) => t.id === todoId)
  if (!todo) throw new Error(`No such todo: ${todoId}`)

  todo.comments.push({ id: crypto.randomUUID(), body, attachments, author, createdAt: Date.now() })
  todo.updatedAt = Date.now()
  await writeTodosData(dataDir, data)

  const active = await readActiveTodo(dataDir)
  if (active && active.id === todoId && !active.commentLogged) {
    await writeActiveTodo(dataDir, { ...active, commentLogged: true })
  }

  return todo
}
