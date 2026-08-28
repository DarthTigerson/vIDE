import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTodoStore } from '../todoStore'
import type { TodoProject, Todo } from '@/types/api'

const project: TodoProject = { id: 'p1', name: 'vIDE', key: 'H', nextNumber: 2, createdAt: 1 }

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 'H-1',
    projectId: 'p1',
    title: 'Fix bug',
    description: '',
    attachments: [],
    status: 'backlog',
    archived: false,
    label: null,
    tags: [],
    prUrl: null,
    comments: [],
    author: 'developer',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

vi.stubGlobal('window', {
  api: {
    todosListProjects: vi.fn().mockResolvedValue([project]),
    todosCreateProject: vi.fn(),
    todosListTodos: vi.fn().mockResolvedValue([makeTodo()]),
    todosCreateTodo: vi.fn(),
    todosUpdateTodo: vi.fn(),
    todosReorderTodo: vi.fn(),
    todosArchiveTodo: vi.fn(),
    todosDeleteTodo: vi.fn().mockResolvedValue(undefined),
    todosAddComment: vi.fn(),
    todosSaveAttachment: vi.fn(),
  },
})

describe('todoStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useTodoStore.setState({ projects: [], todosByProject: {} })
  })

  it('loadProjects populates projects from the API', async () => {
    await useTodoStore.getState().loadProjects()
    expect(useTodoStore.getState().projects).toEqual([project])
  })

  it('createProject calls the API and appends the returned project', async () => {
    const created: TodoProject = { id: 'p2', name: 'Harness', key: 'HA', nextNumber: 1, createdAt: 2 }
    ;(window.api.todosCreateProject as ReturnType<typeof vi.fn>).mockResolvedValue(created)

    const result = await useTodoStore.getState().createProject('Harness', 'HA')

    expect(window.api.todosCreateProject).toHaveBeenCalledWith('Harness', 'HA')
    expect(result).toEqual(created)
    expect(useTodoStore.getState().projects).toContainEqual(created)
  })

  it('loadTodos populates todosByProject for the given project', async () => {
    await useTodoStore.getState().loadTodos('p1')
    expect(useTodoStore.getState().todosByProject.p1).toEqual([makeTodo()])
  })

  it('createTodo appends the new todo into its project list', async () => {
    useTodoStore.setState({ todosByProject: { p1: [] } })
    const created = makeTodo({ id: 'H-2', title: 'New one' })
    ;(window.api.todosCreateTodo as ReturnType<typeof vi.fn>).mockResolvedValue(created)

    await useTodoStore.getState().createTodo('p1', 'New one')

    expect(window.api.todosCreateTodo).toHaveBeenCalledWith('p1', 'New one')
    expect(useTodoStore.getState().todosByProject.p1).toEqual([created])
  })

  it('updateTodo replaces the matching todo in its project list', async () => {
    useTodoStore.setState({ todosByProject: { p1: [makeTodo()] } })
    const updated = makeTodo({ status: 'in_progress' })
    ;(window.api.todosUpdateTodo as ReturnType<typeof vi.fn>).mockResolvedValue(updated)

    await useTodoStore.getState().updateTodo('H-1', { status: 'in_progress' })

    expect(window.api.todosUpdateTodo).toHaveBeenCalledWith('H-1', { status: 'in_progress' })
    expect(useTodoStore.getState().todosByProject.p1).toEqual([updated])
  })

  it('reorderTodo splices the todo before the target id and updates its status locally', async () => {
    useTodoStore.setState({
      todosByProject: {
        p1: [makeTodo({ id: 'H-1' }), makeTodo({ id: 'H-2' }), makeTodo({ id: 'H-3' })],
      },
    })

    await useTodoStore.getState().reorderTodo('p1', 'H-3', 'in_progress', 'H-2')

    expect(window.api.todosReorderTodo).toHaveBeenCalledWith('H-3', 'in_progress', 'H-2')
    const ids = useTodoStore.getState().todosByProject.p1.map((t) => t.id)
    expect(ids).toEqual(['H-1', 'H-3', 'H-2'])
    expect(useTodoStore.getState().todosByProject.p1.find((t) => t.id === 'H-3')?.status).toBe(
      'in_progress'
    )
  })

  it('reorderTodo appends to the end when beforeId is null', async () => {
    useTodoStore.setState({
      todosByProject: { p1: [makeTodo({ id: 'H-1' }), makeTodo({ id: 'H-2' })] },
    })

    await useTodoStore.getState().reorderTodo('p1', 'H-1', 'done', null)

    const ids = useTodoStore.getState().todosByProject.p1.map((t) => t.id)
    expect(ids).toEqual(['H-2', 'H-1'])
  })

  it('archiveTodo replaces the matching todo in its project list', async () => {
    useTodoStore.setState({ todosByProject: { p1: [makeTodo()] } })
    const archived = makeTodo({ archived: true })
    ;(window.api.todosArchiveTodo as ReturnType<typeof vi.fn>).mockResolvedValue(archived)

    await useTodoStore.getState().archiveTodo('H-1', true)

    expect(window.api.todosArchiveTodo).toHaveBeenCalledWith('H-1', true)
    expect(useTodoStore.getState().todosByProject.p1).toEqual([archived])
  })

  it('deleteTodo removes the todo from its project list', async () => {
    useTodoStore.setState({ todosByProject: { p1: [makeTodo()] } })

    await useTodoStore.getState().deleteTodo('H-1')

    expect(window.api.todosDeleteTodo).toHaveBeenCalledWith('H-1')
    expect(useTodoStore.getState().todosByProject.p1).toEqual([])
  })

  it('saveAttachment delegates to the API and returns the attachment id', async () => {
    ;(window.api.todosSaveAttachment as ReturnType<typeof vi.fn>).mockResolvedValue('att-1')

    const id = await useTodoStore.getState().saveAttachment('data:image/png;base64,AAA')

    expect(window.api.todosSaveAttachment).toHaveBeenCalledWith('data:image/png;base64,AAA')
    expect(id).toBe('att-1')
  })

  it('addComment replaces the todo with the server-returned version (including the new comment)', async () => {
    useTodoStore.setState({ todosByProject: { p1: [makeTodo()] } })
    const withComment = makeTodo({
      comments: [{ id: 'c1', body: 'looks good', attachments: [], author: 'developer', createdAt: 5 }],
    })
    ;(window.api.todosAddComment as ReturnType<typeof vi.fn>).mockResolvedValue(withComment)

    await useTodoStore.getState().addComment('H-1', 'looks good')

    expect(window.api.todosAddComment).toHaveBeenCalledWith('H-1', 'looks good', undefined)
    expect(useTodoStore.getState().todosByProject.p1).toEqual([withComment])
  })

  it('refreshAll reloads projects and every project whose todos are already loaded', async () => {
    useTodoStore.setState({ todosByProject: { p1: [makeTodo()], p2: [] } })
    ;(window.api.todosListTodos as ReturnType<typeof vi.fn>).mockImplementation((projectId: string) =>
      Promise.resolve(projectId === 'p1' ? [makeTodo({ status: 'done' })] : [])
    )

    await useTodoStore.getState().refreshAll()

    expect(window.api.todosListProjects).toHaveBeenCalled()
    expect(window.api.todosListTodos).toHaveBeenCalledWith('p1')
    expect(window.api.todosListTodos).toHaveBeenCalledWith('p2')
    expect(useTodoStore.getState().todosByProject.p1[0].status).toBe('done')
  })

  it("refreshAll doesn't fetch todos for a project that was never loaded", async () => {
    useTodoStore.setState({ todosByProject: {} })

    await useTodoStore.getState().refreshAll()

    expect(window.api.todosListTodos).not.toHaveBeenCalled()
  })
})
