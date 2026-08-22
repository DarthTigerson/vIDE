import { app, ipcMain } from 'electron'
import { join } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { readImageDataUrl } from './fsOps'

export type TodoStatus = 'backlog' | 'todo' | 'in_progress' | 'done'
export type TodoLabel = 'bug' | 'feature' | 'nice-to-have'

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
  createdAt: number
  updatedAt: number
}

interface TodosData {
  projects: TodoProject[]
  todos: Todo[]
}

function todosPath(): string {
  return join(app.getPath('userData'), 'todos.json')
}

function attachmentsDir(): string {
  return join(app.getPath('userData'), 'todos-attachments')
}

async function readTodosData(): Promise<TodosData> {
  try {
    const data = await readFile(todosPath(), 'utf-8')
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
  }
}

async function writeTodosData(data: TodosData): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(todosPath(), JSON.stringify(data), 'utf-8')
}

async function listProjects(): Promise<TodoProject[]> {
  const data = await readTodosData()
  return data.projects
}

async function createProject(name: string, key: string): Promise<TodoProject> {
  const trimmedKey = key.trim()
  if (!trimmedKey) throw new Error('Project key is required')

  const data = await readTodosData()
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
  await writeTodosData(data)
  return project
}

async function listTodos(projectId: string): Promise<Todo[]> {
  const data = await readTodosData()
  return data.todos.filter((t) => t.projectId === projectId)
}

async function createTodo(projectId: string, title: string): Promise<Todo> {
  const data = await readTodosData()
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
    createdAt: now,
    updatedAt: now,
  }
  project.nextNumber += 1
  data.todos.push(todo)
  await writeTodosData(data)
  return todo
}

type TodoPatch = Partial<
  Pick<Todo, 'title' | 'description' | 'attachments' | 'status' | 'label' | 'tags' | 'prUrl'>
>

async function updateTodo(id: string, patch: TodoPatch): Promise<Todo> {
  const data = await readTodosData()
  const todo = data.todos.find((t) => t.id === id)
  if (!todo) throw new Error(`No such todo: ${id}`)

  Object.assign(todo, patch, { updatedAt: Date.now() })
  await writeTodosData(data)
  return todo
}

async function reorderTodo(id: string, status: TodoStatus, beforeId: string | null): Promise<Todo> {
  const data = await readTodosData()
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

  await writeTodosData(data)
  return todo
}

async function archiveTodo(id: string, archived: boolean): Promise<Todo> {
  const data = await readTodosData()
  const todo = data.todos.find((t) => t.id === id)
  if (!todo) throw new Error(`No such todo: ${id}`)

  todo.archived = archived
  todo.updatedAt = Date.now()
  await writeTodosData(data)
  return todo
}

async function deleteTodo(id: string): Promise<void> {
  const data = await readTodosData()
  data.todos = data.todos.filter((t) => t.id !== id)
  await writeTodosData(data)
}

async function addComment(todoId: string, body: string, attachments: string[] = []): Promise<Todo> {
  const data = await readTodosData()
  const todo = data.todos.find((t) => t.id === todoId)
  if (!todo) throw new Error(`No such todo: ${todoId}`)

  todo.comments.push({ id: crypto.randomUUID(), body, attachments, createdAt: Date.now() })
  todo.updatedAt = Date.now()
  await writeTodosData(data)
  return todo
}

async function saveAttachment(dataUrl: string): Promise<string> {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const id = crypto.randomUUID()
  await mkdir(attachmentsDir(), { recursive: true })
  await writeFile(join(attachmentsDir(), `${id}.png`), Buffer.from(base64, 'base64'))
  return id
}

async function readAttachmentDataUrl(id: string): Promise<string> {
  return readImageDataUrl(join(attachmentsDir(), `${id}.png`))
}

export function registerTodoHandlers(): void {
  ipcMain.handle('todos:listProjects', () => listProjects())
  ipcMain.handle('todos:createProject', (_e, name: string, key: string) => createProject(name, key))
  ipcMain.handle('todos:listTodos', (_e, projectId: string) => listTodos(projectId))
  ipcMain.handle('todos:createTodo', (_e, projectId: string, title: string) => createTodo(projectId, title))
  ipcMain.handle('todos:updateTodo', (_e, id: string, patch: TodoPatch) => updateTodo(id, patch))
  ipcMain.handle('todos:reorderTodo', (_e, id: string, status: TodoStatus, beforeId: string | null) =>
    reorderTodo(id, status, beforeId)
  )
  ipcMain.handle('todos:archiveTodo', (_e, id: string, archived: boolean) => archiveTodo(id, archived))
  ipcMain.handle('todos:deleteTodo', (_e, id: string) => deleteTodo(id))
  ipcMain.handle('todos:addComment', (_e, todoId: string, body: string, attachments?: string[]) =>
    addComment(todoId, body, attachments)
  )
  ipcMain.handle('todos:saveAttachment', (_e, dataUrl: string) => saveAttachment(dataUrl))
  ipcMain.handle('todos:readAttachmentDataUrl', (_e, id: string) => readAttachmentDataUrl(id))
}
