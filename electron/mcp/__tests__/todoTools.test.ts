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

import { createProject, createTodo } from '../../todosStore'
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

  it('list_todo_projects reports when there are no boards yet', async () => {
    const tools = buildTodoTools(DATA_DIR)
    const result = await findTool(tools, 'list_todo_projects').handler({})

    expect(result.toLowerCase()).toContain('no todo')
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

  it('list_open_todos excludes archived and done tickets', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Open one')
    const tools = buildTodoTools(DATA_DIR)
    await findTool(tools, 'update_todo_status').handler({ id: 'H-1', status: 'done' })
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

  it('update_todo_status changes the status and is reflected in get_todo', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Something')
    const tools = buildTodoTools(DATA_DIR)

    await findTool(tools, 'update_todo_status').handler({ id: 'H-1', status: 'in_progress' })
    const result = await findTool(tools, 'get_todo').handler({ id: 'H-1' })

    expect(result).toContain('in_progress')
  })

  it('update_todo_status rejects an invalid status', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Something')
    const tools = buildTodoTools(DATA_DIR)

    await expect(findTool(tools, 'update_todo_status').handler({ id: 'H-1', status: 'yolo' })).rejects.toThrow(
      /invalid status/i
    )
  })

  it('add_todo_comment appends a comment visible from get_todo', async () => {
    const project = await createProject(DATA_DIR, 'vIDE', 'H')
    await createTodo(DATA_DIR, project.id, 'Something')
    const tools = buildTodoTools(DATA_DIR)

    await findTool(tools, 'add_todo_comment').handler({ id: 'H-1', body: 'Looks good' })
    const result = await findTool(tools, 'get_todo').handler({ id: 'H-1' })

    expect(result).toContain('Looks good')
  })
})
