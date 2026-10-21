import type { McpToolDef } from './protocol'
import {
  readVisibleTodosData,
  createTodo,
  updateTodo,
  addComment,
  startTodo,
  archiveTodo,
  type Todo,
  type TodoProject,
  type TodoStatus,
  type TodoLabel,
  type TodoPatch,
  type TodoAuthor,
  createProject,
} from '../todosStore'

const STATUSES: TodoStatus[] = ['backlog', 'todo', 'in_progress', 'done']
const LABELS: TodoLabel[] = ['bug', 'feature', 'nice-to-have']

function summarize(todo: Todo): string {
  return `${todo.id} [${todo.status}] ${todo.title}`
}

function formatDetail(todo: Todo, project: TodoProject | undefined): string {
  const lines = [
    `${todo.id}: ${todo.title}`,
    `Project: ${project ? `${project.name} (${project.key})` : todo.projectId}`,
    `Author: ${todo.author}`,
    `Status: ${todo.status}`,
    `Label: ${todo.label ?? 'none'}`,
    `Tags: ${todo.tags.length ? todo.tags.join(', ') : 'none'}`,
    `Archived: ${todo.archived ? 'yes' : 'no'}`,
    `Description: ${todo.description || '(none)'}`,
  ]
  if (todo.attachments.length) lines.push(`Attachments: ${todo.attachments.length}`)
  if (todo.prUrl) lines.push(`PR: ${todo.prUrl}`)
  if (todo.comments.length) {
    lines.push('Comments:')
    for (const c of todo.comments) lines.push(`- [${c.author}] ${c.body}`)
  }
  return lines.join('\n')
}

function findProjectByKey(projects: TodoProject[], key: string): TodoProject | undefined {
  return projects.find((p) => p.key.toLowerCase() === key.toLowerCase())
}

// Shared by the vide-todos MCP server (Claude) and Bridge's system prompt.
export const TODO_WORKFLOW_INSTRUCTIONS =
  'When you start substantive work tied to a vIDE ticket, call start_todo(id) to mark it in_progress. ' +
  'As you make progress, call add_todo_comment(id, body) with a short note — this is what lets a future ' +
  "session (after a compaction, a crash, or picking the project back up later) reconstruct what happened " +
  "and why, without the user re-explaining it. If you discover something unrelated to the ticket you're " +
  'working on, file it as its own ticket with create_todo instead of expanding scope on the current one. ' +
  'Note: once you call start_todo on a ticket, you will be required to log a progress comment on it ' +
  "before you can finish your turn — this is enforced, not just a suggestion.\n\n" +
  'For a large task (a multi-part spec, a build with milestones), plan on the board before coding: ' +
  'create_todo_project for it, then create_todos with the whole breakdown in the order to do it — each ticket ' +
  'small enough to finish and verify in one go, its description saying what "done" means and which part of ' +
  'the spec it comes from. Then work one ticket at a time: next_todo, start_todo, do and verify the work, ' +
  'add_todo_comment with what changed, update_todo to status done, and repeat. The board is your memory: ' +
  'when unsure where you are, call list_project_todos instead of re-reading the whole spec.'

// Board order within a status is array order (what drag-reordering edits),
// so "next" respects the user's own prioritising: todo before backlog.
function nextTodo(todos: Todo[], projectId: string): Todo | undefined {
  const live = todos.filter((t) => t.projectId === projectId && !t.archived)
  return live.find((t) => t.status === 'todo') ?? live.find((t) => t.status === 'backlog')
}

// `author` is who the tickets and comments are attributed to on the board:
// 'claude' for the MCP server, 'bridge'/'llama' for Bridge sessions.
export function buildTodoTools(dataDir: string, author: TodoAuthor = 'claude'): McpToolDef[] {
  return [
    {
      name: 'list_todo_projects',
      description: "List the user's vIDE todo boards (project name and key).",
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const { projects } = await readVisibleTodosData(dataDir)
        if (!projects.length) return 'No todo projects yet.'
        return projects.map((p) => `${p.key} — ${p.name}`).join('\n')
      },
    },
    {
      name: 'list_open_todos',
      description: 'List all non-archived, non-done todos across every board.',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        const { todos } = await readVisibleTodosData(dataDir)
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
        const { todos } = await readVisibleTodosData(dataDir)
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
        const { todos, projects } = await readVisibleTodosData(dataDir)
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
        const { projects } = await readVisibleTodosData(dataDir)
        const project = findProjectByKey(projects, projectKey)
        if (!project) throw new Error(`No such project key: ${projectKey}`)

        const todo = await createTodo(dataDir, project.id, String(args.title), author)
        if (args.description) await updateTodo(dataDir, todo.id, { description: String(args.description) })
        return `Created ${todo.id}`
      },
    },
    {
      name: 'update_todo',
      description:
        `Update a todo's status, label, and/or tags — pass only the fields you want to change. ` +
        `Valid statuses: ${STATUSES.join(', ')}. Valid labels: ${LABELS.join(', ')}, or null to clear.`,
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: STATUSES },
          label: { type: ['string', 'null'], enum: [...LABELS, null] },
          tags: { type: 'array', items: { type: 'string' } },
        },
        required: ['id'],
      },
      handler: async (args) => {
        const patch: TodoPatch = {}

        if (args.status !== undefined) {
          const status = String(args.status) as TodoStatus
          if (!STATUSES.includes(status)) throw new Error(`Invalid status: ${args.status}`)
          patch.status = status
        }

        if (args.label !== undefined) {
          if (args.label !== null && !LABELS.includes(args.label as TodoLabel)) {
            throw new Error(`Invalid label: ${args.label}`)
          }
          patch.label = args.label as TodoLabel | null
        }

        if (args.tags !== undefined) {
          if (!Array.isArray(args.tags)) throw new Error('tags must be an array of strings')
          patch.tags = args.tags.map(String)
        }

        const todo = await updateTodo(dataDir, String(args.id), patch)
        return `Updated ${todo.id}: status=${todo.status}, label=${todo.label ?? 'none'}, tags=${
          todo.tags.join(', ') || 'none'
        }`
      },
    },
    {
      name: 'start_todo',
      description:
        'Mark a todo as the one you are actively working on: moves it to in_progress and starts tracking ' +
        'that you should log progress via add_todo_comment before you finish this turn.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      handler: async (args) => {
        const todo = await startTodo(dataDir, String(args.id))
        return `Started ${todo.id} (status now in_progress)`
      },
    },
    {
      name: 'archive_todo',
      description:
        'Archive a todo (or unarchive it by passing archived: false). Archived todos are hidden from the ' +
        'board but not deleted.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' }, archived: { type: 'boolean' } },
        required: ['id'],
      },
      handler: async (args) => {
        const archived = args.archived === undefined ? true : Boolean(args.archived)
        const todo = await archiveTodo(dataDir, String(args.id), archived)
        return `${archived ? 'Archived' : 'Unarchived'} ${todo.id}`
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
        const todo = await addComment(dataDir, String(args.id), String(args.body), [], author)
        return `Added comment to ${todo.id}`
      },
    },
    {
      name: 'create_todo_project',
      description:
        'Create a new todo board for a piece of work. The key is the ticket prefix (2-10 letters/digits, ' +
        'e.g. "RECALL" gives RECALL-1, RECALL-2…).',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' }, key: { type: 'string' } },
        required: ['name', 'key'],
      },
      handler: async (args) => {
        const key = String(args.key).trim().toUpperCase()
        if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) throw new Error('key must be 2-10 letters/digits, starting with a letter')
        const project = await createProject(dataDir, String(args.name), key)
        return `Created project ${project.key} — ${project.name}`
      },
    },
    {
      name: 'create_todos',
      description:
        'File several tickets at once on a board, in the order given (that is the order next_todo hands ' +
        'them out). Use this to lay out a task breakdown in one call.',
      inputSchema: {
        type: 'object',
        properties: {
          projectKey: { type: 'string' },
          todos: {
            type: 'array',
            items: {
              type: 'object',
              properties: { title: { type: 'string' }, description: { type: 'string' } },
              required: ['title'],
            },
          },
        },
        required: ['projectKey', 'todos'],
      },
      handler: async (args) => {
        const projectKey = String(args.projectKey)
        const { projects } = await readVisibleTodosData(dataDir)
        const project = findProjectByKey(projects, projectKey)
        if (!project) throw new Error(`No such project key: ${projectKey}`)
        if (!Array.isArray(args.todos) || args.todos.length === 0) throw new Error('todos must be a non-empty array')

        const created: string[] = []
        for (const item of args.todos as Array<{ title?: unknown; description?: unknown }>) {
          const todo = await createTodo(dataDir, project.id, String(item.title ?? ''), author)
          if (item.description) await updateTodo(dataDir, todo.id, { description: String(item.description) })
          created.push(`${todo.id} ${todo.title}`)
        }
        return `Created ${created.length} tickets in ${project.key}:\n${created.join('\n')}`
      },
    },
    {
      name: 'list_project_todos',
      description:
        "List one board's tickets in board order, grouped by status — a quick view of where the work stands.",
      inputSchema: {
        type: 'object',
        properties: {
          projectKey: { type: 'string' },
          includeDone: { type: 'boolean', description: 'Also list done tickets (default false, just counted)' },
        },
        required: ['projectKey'],
      },
      handler: async (args) => {
        const projectKey = String(args.projectKey)
        const { projects, todos } = await readVisibleTodosData(dataDir)
        const project = findProjectByKey(projects, projectKey)
        if (!project) throw new Error(`No such project key: ${projectKey}`)
        const live = todos.filter((t) => t.projectId === project.id && !t.archived)
        const order: TodoStatus[] = ['in_progress', 'todo', 'backlog', 'done']
        const sections = order.map((status) => {
          const items = live.filter((t) => t.status === status)
          if (!items.length) return null
          if (status === 'done' && !args.includeDone) return `done: ${items.length}`
          return `${status}:\n${items.map((t) => `  ${t.id} ${t.title}`).join('\n')}`
        })
        const body = sections.filter(Boolean).join('\n')
        return `${project.key} — ${project.name}\n${body || 'No tickets yet.'}`
      },
    },
    {
      name: 'next_todo',
      description:
        'Get the next ticket to work on from a board (first in todo, then first in backlog, in board order), ' +
        'with its full detail. Call start_todo on it before starting.',
      inputSchema: { type: 'object', properties: { projectKey: { type: 'string' } }, required: ['projectKey'] },
      handler: async (args) => {
        const projectKey = String(args.projectKey)
        const { projects, todos } = await readVisibleTodosData(dataDir)
        const project = findProjectByKey(projects, projectKey)
        if (!project) throw new Error(`No such project key: ${projectKey}`)
        const inProgress = todos.filter((t) => t.projectId === project.id && !t.archived && t.status === 'in_progress')
        const next = nextTodo(todos, project.id)
        const note = inProgress.length ? `Still in progress: ${inProgress.map((t) => t.id).join(', ')}\n\n` : ''
        if (!next) return `${note}No tickets left in todo or backlog for ${project.key}.`
        return note + formatDetail(next, project)
      },
    },
  ]
}
