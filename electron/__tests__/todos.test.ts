import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readActiveTodo, startTodo } from '../todosStore'

const { handlers, fsState } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => unknown>,
  fsState: { files: new Map<string, string | Buffer>() },
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/fake/userData' },
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => unknown) => {
      handlers[channel] = fn
    },
  },
}))

vi.mock('fs/promises', () => ({
  readFile: async (path: string) => {
    if (!fsState.files.has(path)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return fsState.files.get(path)!
  },
  writeFile: async (path: string, data: string | Buffer) => {
    fsState.files.set(path, data)
  },
  mkdir: async () => {},
  rm: async (path: string) => {
    fsState.files.delete(path)
  },
}))

let uuidCounter = 0
vi.stubGlobal('crypto', {
  randomUUID: () => `uuid-${++uuidCounter}`,
})

import { registerTodoHandlers } from '../todos'

describe('todos', () => {
  beforeEach(() => {
    fsState.files.clear()
    uuidCounter = 0
    registerTodoHandlers()
  })

  describe('projects', () => {
    it('returns an empty list when nothing has been created yet', async () => {
      expect(await handlers['todos:listProjects']()).toEqual([])
    })

    it('createProject adds a project that listProjects returns', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      expect(project).toMatchObject({ name: 'vIDE', key: 'H', nextNumber: 1 })
      expect(await handlers['todos:listProjects']()).toEqual([project])
    })

    it('rejects a key that collides case-insensitively with an existing project', async () => {
      await handlers['todos:createProject']({}, 'vIDE', 'H')
      await expect(handlers['todos:createProject']({}, 'Harness', 'h')).rejects.toThrow()
    })

    it('rejects an empty key', async () => {
      await expect(handlers['todos:createProject']({}, 'vIDE', '   ')).rejects.toThrow()
    })
  })

  describe('todos', () => {
    it('createTodo builds the id from the project key and an incrementing counter', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const first = (await handlers['todos:createTodo']({}, project.id, 'First')) as any
      const second = (await handlers['todos:createTodo']({}, project.id, 'Second')) as any
      expect(first.id).toBe('H-1')
      expect(second.id).toBe('H-2')
    })

    it('createTodo throws for an unknown project', async () => {
      await expect(handlers['todos:createTodo']({}, 'missing', 'Title')).rejects.toThrow()
    })

    it('createTodo starts a todo with the expected defaults', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const todo = (await handlers['todos:createTodo']({}, project.id, 'First')) as any
      expect(todo).toMatchObject({
        projectId: project.id,
        title: 'First',
        description: '',
        attachments: [],
        status: 'backlog',
        archived: false,
        label: null,
        tags: [],
        prUrl: null,
        comments: [],
        author: 'developer',
      })
    })

    it('updateTodo can set tags', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const todo = (await handlers['todos:createTodo']({}, project.id, 'First')) as any
      const updated = (await handlers['todos:updateTodo']({}, todo.id, { tags: ['frontend', 'urgent'] })) as any

      expect(updated.tags).toEqual(['frontend', 'urgent'])
    })

    it('updateTodo can set and clear the label', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const todo = (await handlers['todos:createTodo']({}, project.id, 'First')) as any

      const labeled = (await handlers['todos:updateTodo']({}, todo.id, { label: 'bug' })) as any
      expect(labeled.label).toBe('bug')

      const cleared = (await handlers['todos:updateTodo']({}, todo.id, { label: null })) as any
      expect(cleared.label).toBeNull()
    })

    it('listTodos returns only todos for the given project', async () => {
      const p1 = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const p2 = (await handlers['todos:createProject']({}, 'Harness', 'A')) as any
      const t1 = await handlers['todos:createTodo']({}, p1.id, 'In p1')
      await handlers['todos:createTodo']({}, p2.id, 'In p2')

      expect(await handlers['todos:listTodos']({}, p1.id)).toEqual([t1])
    })

    it('updateTodo merges the patch and bumps updatedAt', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const todo = (await handlers['todos:createTodo']({}, project.id, 'First')) as any
      const updated = (await handlers['todos:updateTodo']({}, todo.id, { status: 'in_progress' })) as any

      expect(updated.status).toBe('in_progress')
      expect(updated.title).toBe('First')
    })

    it('updateTodo throws for an unknown id', async () => {
      await expect(handlers['todos:updateTodo']({}, 'missing', { title: 'x' })).rejects.toThrow()
    })

    it('reorderTodo moves the todo before the given id and updates its status', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const t1 = (await handlers['todos:createTodo']({}, project.id, 'First')) as any
      const t2 = (await handlers['todos:createTodo']({}, project.id, 'Second')) as any
      const t3 = (await handlers['todos:createTodo']({}, project.id, 'Third')) as any

      const moved = (await handlers['todos:reorderTodo']({}, t3.id, 'in_progress', t2.id)) as any
      expect(moved.status).toBe('in_progress')

      const todos = (await handlers['todos:listTodos']({}, project.id)) as any[]
      expect(todos.map((t) => t.id)).toEqual([t1.id, t3.id, t2.id])
    })

    it('reorderTodo appends to the end when beforeId is null', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const t1 = (await handlers['todos:createTodo']({}, project.id, 'First')) as any
      const t2 = (await handlers['todos:createTodo']({}, project.id, 'Second')) as any

      await handlers['todos:reorderTodo']({}, t1.id, 'done', null)

      const todos = (await handlers['todos:listTodos']({}, project.id)) as any[]
      expect(todos.map((t) => t.id)).toEqual([t2.id, t1.id])
      expect(todos[1].status).toBe('done')
    })

    it('reorderTodo throws for an unknown id', async () => {
      await expect(handlers['todos:reorderTodo']({}, 'missing', 'todo', null)).rejects.toThrow()
    })

    it('archiveTodo sets the archived flag', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const todo = (await handlers['todos:createTodo']({}, project.id, 'First')) as any
      const archived = (await handlers['todos:archiveTodo']({}, todo.id, true)) as any
      expect(archived.archived).toBe(true)
    })

    it('deleteTodo removes the todo and is idempotent', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const todo = (await handlers['todos:createTodo']({}, project.id, 'First')) as any

      await handlers['todos:deleteTodo']({}, todo.id)
      expect(await handlers['todos:listTodos']({}, project.id)).toEqual([])
      await expect(handlers['todos:deleteTodo']({}, todo.id)).resolves.toBeUndefined()
    })

    it('addComment appends a comment and returns the updated todo', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const todo = (await handlers['todos:createTodo']({}, project.id, 'First')) as any
      const updated = (await handlers['todos:addComment']({}, todo.id, 'Looks good', ['att-1'])) as any

      expect(updated.comments).toHaveLength(1)
      expect(updated.comments[0]).toMatchObject({ body: 'Looks good', attachments: ['att-1'], author: 'developer' })
    })

    it('addComment defaults attachments to an empty array', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const todo = (await handlers['todos:createTodo']({}, project.id, 'First')) as any
      const updated = (await handlers['todos:addComment']({}, todo.id, 'Looks good')) as any

      expect(updated.comments[0].attachments).toEqual([])
    })
  })

  describe('active todo marker', () => {
    it('startTodo moves the ticket to in_progress and creates the marker', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const todo = (await handlers['todos:createTodo']({}, project.id, 'First')) as any

      const updated = await startTodo('/fake/userData', todo.id)
      expect(updated.status).toBe('in_progress')

      const marker = await readActiveTodo('/fake/userData')
      expect(marker).toMatchObject({ id: todo.id, commentLogged: false })
    })

    it('readActiveTodo returns null when no ticket has been started', async () => {
      expect(await readActiveTodo('/fake/userData')).toBeNull()
    })

    it('addComment on the active ticket flips commentLogged to true', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const todo = (await handlers['todos:createTodo']({}, project.id, 'First')) as any
      await startTodo('/fake/userData', todo.id)

      await handlers['todos:addComment']({}, todo.id, 'progress note')

      const marker = await readActiveTodo('/fake/userData')
      expect(marker?.commentLogged).toBe(true)
    })

    it('addComment on a different ticket does not affect the active marker', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const active = (await handlers['todos:createTodo']({}, project.id, 'Active one')) as any
      const other = (await handlers['todos:createTodo']({}, project.id, 'Other one')) as any
      await startTodo('/fake/userData', active.id)

      await handlers['todos:addComment']({}, other.id, 'unrelated comment')

      const marker = await readActiveTodo('/fake/userData')
      expect(marker?.commentLogged).toBe(false)
    })

    it('updateTodo moving the active ticket off in_progress clears the marker', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const todo = (await handlers['todos:createTodo']({}, project.id, 'First')) as any
      await startTodo('/fake/userData', todo.id)

      await handlers['todos:updateTodo']({}, todo.id, { status: 'done' })

      expect(await readActiveTodo('/fake/userData')).toBeNull()
    })

    it('updateTodo on a different ticket does not clear the active marker', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const active = (await handlers['todos:createTodo']({}, project.id, 'Active one')) as any
      const other = (await handlers['todos:createTodo']({}, project.id, 'Other one')) as any
      await startTodo('/fake/userData', active.id)

      await handlers['todos:updateTodo']({}, other.id, { status: 'done' })

      expect(await readActiveTodo('/fake/userData')).toMatchObject({ id: active.id })
    })

    it('updateTodo re-affirming in_progress on the active ticket leaves the marker in place', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const todo = (await handlers['todos:createTodo']({}, project.id, 'First')) as any
      await startTodo('/fake/userData', todo.id)
      await handlers['todos:addComment']({}, todo.id, 'note')

      await handlers['todos:updateTodo']({}, todo.id, { status: 'in_progress' })

      const marker = await readActiveTodo('/fake/userData')
      expect(marker).toMatchObject({ id: todo.id, commentLogged: true })
    })

    it('startTodo throws for an unknown id', async () => {
      await expect(startTodo('/fake/userData', 'missing')).rejects.toThrow()
    })

    it('reorderTodo moving the active ticket to a different status clears the marker', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const todo = (await handlers['todos:createTodo']({}, project.id, 'First')) as any
      await startTodo('/fake/userData', todo.id)

      await handlers['todos:reorderTodo']({}, todo.id, 'done', null)

      expect(await readActiveTodo('/fake/userData')).toBeNull()
    })

    it('reorderTodo re-affirming in_progress on the active ticket leaves the marker in place', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const todo = (await handlers['todos:createTodo']({}, project.id, 'First')) as any
      await startTodo('/fake/userData', todo.id)

      await handlers['todos:reorderTodo']({}, todo.id, 'in_progress', null)

      expect(await readActiveTodo('/fake/userData')).toMatchObject({ id: todo.id })
    })

    it('archiveTodo archiving the active ticket clears the marker', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const todo = (await handlers['todos:createTodo']({}, project.id, 'First')) as any
      await startTodo('/fake/userData', todo.id)

      await handlers['todos:archiveTodo']({}, todo.id, true)

      expect(await readActiveTodo('/fake/userData')).toBeNull()
    })

    it('deleteTodo deleting the active ticket clears the marker', async () => {
      const project = (await handlers['todos:createProject']({}, 'vIDE', 'H')) as any
      const todo = (await handlers['todos:createTodo']({}, project.id, 'First')) as any
      await startTodo('/fake/userData', todo.id)

      await handlers['todos:deleteTodo']({}, todo.id)

      expect(await readActiveTodo('/fake/userData')).toBeNull()
    })

    it('readActiveTodo ignores a marker file with no valid id', async () => {
      fsState.files.set('/fake/userData/active-todo.json', JSON.stringify({ startedAt: 1, commentLogged: false }))
      expect(await readActiveTodo('/fake/userData')).toBeNull()
    })
  })

  describe('backward compatibility', () => {
    function seedLegacyTodo(overrides: Record<string, unknown> = {}) {
      const legacyTodo = {
        id: 'H-1',
        projectId: 'p1',
        title: 'Old ticket',
        description: '',
        attachments: [],
        status: 'backlog',
        archived: false,
        labels: [],
        prUrl: null,
        comments: [],
        createdAt: 1,
        updatedAt: 1,
        // no `tags` field — simulates data written before tags existed
        ...overrides,
      }
      fsState.files.set(
        '/fake/userData/todos.json',
        JSON.stringify({
          projects: [{ id: 'p1', name: 'vIDE', key: 'H', nextNumber: 2, createdAt: 1 }],
          todos: [legacyTodo],
        })
      )
    }

    it('normalizes todos persisted before the tags field existed', async () => {
      seedLegacyTodo()
      const todos = (await handlers['todos:listTodos']({}, 'p1')) as any[]
      expect(todos[0].tags).toEqual([])
    })

    it('migrates the old `labels` array to the new single `label` field', async () => {
      seedLegacyTodo({ labels: ['bug'] })
      const todos = (await handlers['todos:listTodos']({}, 'p1')) as any[]
      expect(todos[0].label).toBe('bug')
      expect(todos[0].labels).toBeUndefined()
    })

    it('migrates an empty legacy `labels` array to a null label', async () => {
      seedLegacyTodo({ labels: [] })
      const todos = (await handlers['todos:listTodos']({}, 'p1')) as any[]
      expect(todos[0].label).toBeNull()
    })

    it('defaults a legacy todo with no author field to developer', async () => {
      seedLegacyTodo()
      const todos = (await handlers['todos:listTodos']({}, 'p1')) as any[]
      expect(todos[0].author).toBe('developer')
    })

    it('defaults a legacy comment with no author field to developer', async () => {
      seedLegacyTodo({ comments: [{ id: 'c1', body: 'old comment', attachments: [], createdAt: 1 }] })
      const todos = (await handlers['todos:listTodos']({}, 'p1')) as any[]
      expect(todos[0].comments[0].author).toBe('developer')
    })
  })

  describe('attachments', () => {
    it('saveAttachment then readAttachmentDataUrl round-trips the same image bytes', async () => {
      const payload = Buffer.from('fake png bytes').toString('base64')
      const id = await handlers['todos:saveAttachment']({}, `data:image/png;base64,${payload}`)

      const dataUrl = (await handlers['todos:readAttachmentDataUrl']({}, id)) as string

      expect(dataUrl).toBe(`data:image/png;base64,${payload}`)
    })
  })
})
