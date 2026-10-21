import { describe, it, expect, beforeEach, vi } from 'vitest'

const { fsState } = vi.hoisted(() => ({ fsState: { files: new Map<string, string>() } }))

vi.mock('fs/promises', () => ({
  readFile: async (path: string) => {
    if (!fsState.files.has(path)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return fsState.files.get(path)!
  },
  writeFile: async (path: string, data: string) => {
    fsState.files.set(path, data)
  },
  mkdir: async () => {},
}))

let uuidCounter = 0
vi.stubGlobal('crypto', { randomUUID: () => `uuid-${++uuidCounter}` })

import { createProject, createTodo, trashProject, readTodosData, updateTodo } from '../../todosStore'
import { buildTodoTools } from '../todoTools'

const DATA_DIR = '/fake/userData'

function findTool(tools: ReturnType<typeof buildTodoTools>, name: string) {
  const tool = tools.find((t) => t.name === name)
  if (!tool) throw new Error(`no such tool: ${name}`)
  return tool
}

describe('buildTodoTools', () => {
  beforeEach(() => {
    fsState.files.clear()
    uuidCounter = 0
  })

  it('list_todo_projects reports each board with its key', async () => {
    await createProject(DATA_DIR, 'vIDE', 'H')
    await createProject(DATA_DIR, 'Mobile', 'MOB')

    const tools = buildTodoTools(DATA_DIR)
    const result = await findTool(tools, 'list_todo_projects').handler({})

    expect(result).toContain('H')
    expect(result).toContain('vIDE')
    expect(result).toContain('MOB')
    expect(result).toContain('Mobile')
  })

  it('hides trashed projects and their todos from every read tool', async () => {
    const kept = await createProject(DATA_DIR, 'Kept', 'KEEP')
    const binned = await createProject(DATA_DIR, 'Binned', 'BIN')
    await createTodo(DATA_DIR, kept.id, 'Visible ticket')
    await createTodo(DATA_DIR, binned.id, 'Hidden ticket')
    await trashProject(DATA_DIR, binned.id)
    const tools = buildTodoTools(DATA_DIR)

    expect(await findTool(tools, 'list_todo_projects').handler({})).not.toContain('BIN')
    expect(await findTool(tools, 'list_open_todos').handler({})).not.toContain('BIN-1')
    expect(await findTool(tools, 'search_todos').handler({ query: 'ticket' })).not.toContain('BIN-1')
    await expect(findTool(tools, 'get_todo').handler({ id: 'BIN-1' })).rejects.toThrow(/no such todo/i)
    await expect(findTool(tools, 'create_todo').handler({ projectKey: 'BIN', title: 'x' })).rejects.toThrow(
      /no such project/i
    )
  })

  it('list_todo_projects reports when there are no boards yet', async () => {
    const tools = buildTodoTools(DATA_DIR)
    const result = await findTool(tools, 'list_todo_projects').handler({})

    expect(String(result).toLowerCase()).toContain('no todo')
  })

  it('create_todo files a new ticket under the given project key and returns its id', async () => {
    await createProject(DATA_DIR, 'vIDE', 'H')
    const tools = buildTodoTools(DATA_DIR)

    const result = await findTool(tools, 'create_todo').handler({ projectKey: 'H', title: 'Fix the thing' })

    expect(result).toContain('H-1')
  })

  it('create_todo sets the description when one is provided', async () => {
    await createProject(DATA_DIR, 'vIDE', 'H')
    const tools = buildTodoTools(DATA_DIR)
    await findTool(tools, 'create_todo').handler({ projectKey: 'H', title: 'Fix it', description: 'Steps to repro' })

    const detail = await findTool(tools, 'get_todo').handler({ id: 'H-1' })
    expect(detail).toContain('Steps to repro')
  })

  it('create_todo stamps the todo as claude-authored', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    const tools = buildTodoTools(DATA_DIR)
    await findTool(tools, 'create_todo').handler({ projectKey: project.key, title: 'Fix it' })

    const detail = await findTool(tools, 'get_todo').handler({ id: 'H-1' })
    expect(detail).toContain('Author: claude')
  })

  it('create_todo is case-insensitive about the project key', async () => {
    await createProject(DATA_DIR, 'vIDE', 'H')
    const tools = buildTodoTools(DATA_DIR)

    const result = await findTool(tools, 'create_todo').handler({ projectKey: 'h', title: 'Fix it' })
    expect(result).toContain('H-1')
  })

  it('create_todo throws for an unknown project key', async () => {
    const tools = buildTodoTools(DATA_DIR)
    await expect(findTool(tools, 'create_todo').handler({ projectKey: 'NOPE', title: 'x' })).rejects.toThrow(
      /no such project/i
    )
  })

  it('start_todo moves the ticket to in_progress', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Something')
    const tools = buildTodoTools(DATA_DIR)

    const result = await findTool(tools, 'start_todo').handler({ id: 'H-1' })

    expect(result).toContain('H-1')
    const detail = await findTool(tools, 'get_todo').handler({ id: 'H-1' })
    expect(detail).toContain('Status: in_progress')
  })

  it('start_todo throws for an unknown id', async () => {
    const tools = buildTodoTools(DATA_DIR)
    await expect(findTool(tools, 'start_todo').handler({ id: 'NOPE-1' })).rejects.toThrow(/no such todo/i)
  })

  it('list_open_todos excludes archived and done tickets', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Open one')
    const tools = buildTodoTools(DATA_DIR)
    await findTool(tools, 'update_todo').handler({ id: 'H-1', status: 'done' })
    await findTool(tools, 'create_todo').handler({ projectKey: 'H', title: 'Still open' })

    const result = await findTool(tools, 'list_open_todos').handler({})

    expect(result).not.toContain('H-1')
    expect(result).toContain('H-2')
    expect(result).toContain('Still open')
  })

  it('search_todos matches on title text across all projects', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Fix the login flow')
    await createTodo(DATA_DIR, project.id, 'Unrelated ticket')
    const tools = buildTodoTools(DATA_DIR)

    const result = await findTool(tools, 'search_todos').handler({ query: 'login' })

    expect(result).toContain('H-1')
    expect(result).not.toContain('H-2')
  })

  it('search_todos matches by ticket id', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Something')
    const tools = buildTodoTools(DATA_DIR)

    const result = await findTool(tools, 'search_todos').handler({ query: 'h-1' })
    expect(result).toContain('H-1')
  })

  it('get_todo returns full detail including comments', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Something')
    const tools = buildTodoTools(DATA_DIR)
    await findTool(tools, 'add_todo_comment').handler({ id: 'H-1', body: 'Needs a review' })

    const result = await findTool(tools, 'get_todo').handler({ id: 'H-1' })

    expect(result).toContain('Something')
    expect(result).toContain('Needs a review')
  })

  it('get_todo throws for an unknown id', async () => {
    const tools = buildTodoTools(DATA_DIR)
    await expect(findTool(tools, 'get_todo').handler({ id: 'NOPE-1' })).rejects.toThrow(/no such todo/i)
  })

  it('update_todo changes the status and is reflected in get_todo', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Something')
    const tools = buildTodoTools(DATA_DIR)

    await findTool(tools, 'update_todo').handler({ id: 'H-1', status: 'in_progress' })
    const result = await findTool(tools, 'get_todo').handler({ id: 'H-1' })

    expect(result).toContain('in_progress')
  })

  it('update_todo rejects an invalid status', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Something')
    const tools = buildTodoTools(DATA_DIR)

    await expect(findTool(tools, 'update_todo').handler({ id: 'H-1', status: 'yolo' })).rejects.toThrow(
      /invalid status/i
    )
  })

  it('update_todo sets a label and it is reflected in get_todo', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Something')
    const tools = buildTodoTools(DATA_DIR)

    await findTool(tools, 'update_todo').handler({ id: 'H-1', label: 'bug' })
    const result = await findTool(tools, 'get_todo').handler({ id: 'H-1' })

    expect(result).toContain('Label: bug')
  })

  it('update_todo clears a label when given null', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Something')
    const tools = buildTodoTools(DATA_DIR)

    await findTool(tools, 'update_todo').handler({ id: 'H-1', label: 'bug' })
    await findTool(tools, 'update_todo').handler({ id: 'H-1', label: null })
    const result = await findTool(tools, 'get_todo').handler({ id: 'H-1' })

    expect(result).toContain('Label: none')
  })

  it('update_todo rejects an invalid label', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Something')
    const tools = buildTodoTools(DATA_DIR)

    await expect(findTool(tools, 'update_todo').handler({ id: 'H-1', label: 'urgent' })).rejects.toThrow(
      /invalid label/i
    )
  })

  it('update_todo sets tags and they are reflected in get_todo and search_todos', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Something')
    const tools = buildTodoTools(DATA_DIR)

    await findTool(tools, 'update_todo').handler({ id: 'H-1', tags: ['frontend', 'urgent'] })
    const result = await findTool(tools, 'get_todo').handler({ id: 'H-1' })
    expect(result).toContain('Tags: frontend, urgent')

    const search = await findTool(tools, 'search_todos').handler({ query: 'urgent' })
    expect(search).toContain('H-1')
  })

  it('update_todo can set status, label, and tags together in one call', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Something')
    const tools = buildTodoTools(DATA_DIR)

    await findTool(tools, 'update_todo').handler({
      id: 'H-1',
      status: 'done',
      label: 'feature',
      tags: ['shipped'],
    })
    const result = await findTool(tools, 'get_todo').handler({ id: 'H-1' })

    expect(result).toContain('Status: done')
    expect(result).toContain('Label: feature')
    expect(result).toContain('Tags: shipped')
  })

  it('add_todo_comment appends a comment visible from get_todo', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Something')
    const tools = buildTodoTools(DATA_DIR)

    await findTool(tools, 'add_todo_comment').handler({ id: 'H-1', body: 'Looks good' })
    const result = await findTool(tools, 'get_todo').handler({ id: 'H-1' })

    expect(result).toContain('Looks good')
  })

  it('add_todo_comment stamps the comment as claude-authored', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Something')
    const tools = buildTodoTools(DATA_DIR)

    await findTool(tools, 'add_todo_comment').handler({ id: 'H-1', body: 'Looks good' })
    const result = await findTool(tools, 'get_todo').handler({ id: 'H-1' })

    expect(result).toContain('[claude] Looks good')
  })

  it('get_todo reports whether a todo is archived', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Something')
    const tools = buildTodoTools(DATA_DIR)

    const beforeArchiving = await findTool(tools, 'get_todo').handler({ id: 'H-1' })
    expect(beforeArchiving).toContain('Archived: no')
  })

  it('archive_todo archives a todo by default and it is reflected in get_todo', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Something')
    const tools = buildTodoTools(DATA_DIR)

    const result = await findTool(tools, 'archive_todo').handler({ id: 'H-1' })
    expect(result).toContain('Archived H-1')

    const detail = await findTool(tools, 'get_todo').handler({ id: 'H-1' })
    expect(detail).toContain('Archived: yes')
  })

  it('archive_todo can unarchive when archived is passed as false', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Something')
    const tools = buildTodoTools(DATA_DIR)
    await findTool(tools, 'archive_todo').handler({ id: 'H-1' })

    const result = await findTool(tools, 'archive_todo').handler({ id: 'H-1', archived: false })
    expect(result).toContain('Unarchived H-1')

    const detail = await findTool(tools, 'get_todo').handler({ id: 'H-1' })
    expect(detail).toContain('Archived: no')
  })

  it('archive_todo throws for an unknown id', async () => {
    const tools = buildTodoTools(DATA_DIR)
    await expect(findTool(tools, 'archive_todo').handler({ id: 'NOPE-1' })).rejects.toThrow(/no such todo/i)
  })

  describe('task breakdown', () => {
    it('create_todo_project makes a board with an upper-cased key and rejects bad keys', async () => {
      const tools = buildTodoTools(DATA_DIR)
      expect(await findTool(tools, 'create_todo_project').handler({ name: 'Service Recall', key: 'recall' }))
        .toBe('Created project RECALL — Service Recall')
      await expect(findTool(tools, 'create_todo_project').handler({ name: 'x', key: 'a b' })).rejects.toThrow('2-10')
    })

    it('create_todos files a whole breakdown in order, attributed to the calling agent', async () => {
      await createProject(DATA_DIR, 'Recall', 'RC')
      const tools = buildTodoTools(DATA_DIR, 'llama')
      const out = await findTool(tools, 'create_todos').handler({
        projectKey: 'RC',
        todos: [{ title: 'M0 scaffold', description: 'Section 20 M0' }, { title: 'M1 accounts' }],
      })
      expect(out).toBe('Created 2 tickets in RC:\nRC-1 M0 scaffold\nRC-2 M1 accounts')
      const { todos } = await readTodosData(DATA_DIR)
      expect(todos.map((t) => [t.id, t.status, t.author, t.description])).toEqual([
        ['RC-1', 'backlog', 'llama', 'Section 20 M0'],
        ['RC-2', 'backlog', 'llama', ''],
      ])
    })

    it('next_todo hands out todo before backlog, in board order, and says when the board is finished', async () => {
      const project = await createProject(DATA_DIR, 'Recall', 'RC')
      await createTodo(DATA_DIR, project.id, 'first backlog')
      await createTodo(DATA_DIR, project.id, 'second backlog')
      const tools = buildTodoTools(DATA_DIR)
      const next = findTool(tools, 'next_todo')

      expect(await next.handler({ projectKey: 'RC' })).toContain('RC-1: first backlog')
      await updateTodo(DATA_DIR, 'RC-2', { status: 'todo' })
      expect(await next.handler({ projectKey: 'RC' })).toContain('RC-2: second backlog')

      await updateTodo(DATA_DIR, 'RC-1', { status: 'done' })
      await updateTodo(DATA_DIR, 'RC-2', { status: 'in_progress' })
      expect(await next.handler({ projectKey: 'RC' })).toBe('Still in progress: RC-2\n\nNo tickets left in todo or backlog for RC.')
    })

    it('list_project_todos groups by status and only counts done tickets by default', async () => {
      const project = await createProject(DATA_DIR, 'Recall', 'RC')
      await createTodo(DATA_DIR, project.id, 'a')
      await createTodo(DATA_DIR, project.id, 'b')
      await createTodo(DATA_DIR, project.id, 'c')
      await updateTodo(DATA_DIR, 'RC-1', { status: 'done' })
      await updateTodo(DATA_DIR, 'RC-2', { status: 'in_progress' })

      const out = await findTool(buildTodoTools(DATA_DIR), 'list_project_todos').handler({ projectKey: 'RC' })
      expect(out).toBe('RC — Recall\nin_progress:\n  RC-2 b\nbacklog:\n  RC-3 c\ndone: 1')
    })
  })
})
