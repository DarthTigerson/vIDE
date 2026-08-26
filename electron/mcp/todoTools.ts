import type { McpToolDef } from './protocol'
import {
  readTodosData,
  createTodo,
  updateTodo,
  addComment,
  type Todo,
  type TodoProject,
  type TodoStatus,
} from '../todosStore'

const STATUSES: TodoStatus[] = ['backlog', 'todo', 'in_progress', 'done']

function summarize(todo: Todo): string {
  return `${todo.id} [${todo.status}] ${todo.title}`
}

function formatDetail(todo: Todo, project: TodoProject | undefined): string {
  const lines = [
    `${todo.id}: ${todo.title}`,
    `Project: ${project ? `${project.name} (${project.key})` : todo.projectId}`,
    `Status: ${todo.status}`,
    `Label: ${todo.label ?? 'none'}`,
    `Tags: ${todo.tags.length ? todo.tags.join(', ') : 'none'}`,
    `Description: ${todo.description || '(none)'}`,
  ]
  if (todo.attachments.length) lines.push(`Attachments: ${todo.attachments.length}`)
  if (todo.prUrl) lines.push(`PR: ${todo.prUrl}`)
  if (todo.comments.length) {
    lines.push('Comments:')
    for (const c of todo.comments) lines.push(`- ${c.body}`)
  }
  return lines.join('\n')
}

function findProjectByKey(projects: TodoProject[], key: string): TodoProject | undefined {
  return projects.find((p) => p.key.toLowerCase() === key.toLowerCase())
}

export function buildTodoTools(dataDir: string): McpToolDef[] {
  return [
    {
      name: 'list_todo_projects',
      description: "List the user's vIDE todo boards (project name and key).",
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const { projects } = await readTodosData(dataDir)
        if (!projects.length) return 'No todo projects yet.'
        return projects.map((p) => `${p.key} — ${p.name}`).join('\n')
      },
    },
    {
      name: 'list_open_todos',
      description: 'List all non-archived, non-done todos across every board.',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const { todos } = await readTodosData(dataDir)
        const open = todos.filter((t) => !t.archived && t.status !== 'done')
        if (!open.length) return 'No open todos.'
        return open.map(summarize).join('\n')
      },
    },
    {
      name: 'search_todos',
      description: 'Search todos by id, title, description, or tags (case-insensitive substring match).',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
      handler: async (args) => {
        const query = String(args.query ?? '').toLowerCase()
        const { todos } = await readTodosData(dataDir)
        const matches = todos.filter(
          (t) =>
            t.id.toLowerCase().includes(query) ||
            t.title.toLowerCase().includes(query) ||
            t.description.toLowerCase().includes(query) ||
            t.tags.some((tag) => tag.toLowerCase().includes(query))
        )
        if (!matches.length) return 'No matching todos.'
        return matches.slice(0, 25).map(summarize).join('\n')
      },
    },
    {
      name: 'get_todo',
      description: 'Get full detail for a single todo by id (e.g. "PROJ-123"), including its comments.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      handler: async (args) => {
        const id = String(args.id)
        const { todos, projects } = await readTodosData(dataDir)
        const todo = todos.find((t) => t.id === id)
        if (!todo) throw new Error(`No such todo: ${id}`)
        return formatDetail(
          todo,
          projects.find((p) => p.id === todo.projectId)
        )
      },
    },
    {
      name: 'create_todo',
      description: 'File a new todo under an existing board, identified by its project key. Returns the new ticket id.',
      inputSchema: {
        type: 'object',
        properties: {
          projectKey: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['projectKey', 'title'],
      },
      handler: async (args) => {
        const projectKey = String(args.projectKey)
        const { projects } = await readTodosData(dataDir)
        const project = findProjectByKey(projects, projectKey)
        if (!project) throw new Error(`No such project key: ${projectKey}`)

        const todo = await createTodo(dataDir, project.id, String(args.title))
        if (args.description) await updateTodo(dataDir, todo.id, { description: String(args.description) })
        return `Created ${todo.id}`
      },
    },
    {
      name: 'update_todo_status',
      description: `Move a todo to a different status. Valid statuses: ${STATUSES.join(', ')}.`,
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' }, status: { type: 'string', enum: STATUSES } },
        required: ['id', 'status'],
      },
      handler: async (args) => {
        const status = String(args.status) as TodoStatus
        if (!STATUSES.includes(status)) throw new Error(`Invalid status: ${args.status}`)
        const todo = await updateTodo(dataDir, String(args.id), { status })
        return `${todo.id} is now ${todo.status}`
      },
    },
    {
      name: 'add_todo_comment',
      description: 'Add a comment to a todo — useful for leaving progress notes as you work.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' }, body: { type: 'string' } },
        required: ['id', 'body'],
      },
      handler: async (args) => {
        const todo = await addComment(dataDir, String(args.id), String(args.body))
        return `Added comment to ${todo.id}`
      },
    },
  ]
}
