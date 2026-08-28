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
  rm: async (path: string) => {
    fsState.files.delete(path)
  },
}))

import { decideStopAction } from '../todoEnforcerHook'

const DATA_DIR = '/fake/userData'

function seedMarker(marker: { id: string; startedAt: number; commentLogged: boolean } | null) {
  if (marker === null) {
    fsState.files.delete(`${DATA_DIR}/active-todo.json`)
  } else {
    fsState.files.set(`${DATA_DIR}/active-todo.json`, JSON.stringify(marker))
  }
}

function seedTodo(id: string, overrides: Record<string, unknown> = {}) {
  fsState.files.set(
    `${DATA_DIR}/todos.json`,
    JSON.stringify({
      projects: [],
      todos: [
        {
          id,
          projectId: 'p1',
          title: 'x',
          description: '',
          attachments: [],
          status: 'in_progress',
          archived: false,
          label: null,
          tags: [],
          prUrl: null,
          comments: [],
          author: 'developer',
          createdAt: 1,
          updatedAt: 1,
          ...overrides,
        },
      ],
    })
  )
}

describe('decideStopAction', () => {
  beforeEach(() => {
    fsState.files.clear()
  })

  it('allows the stop when there is no active ticket', async () => {
    expect(await decideStopAction(DATA_DIR, {})).toBeNull()
  })

  it('allows the stop when the active ticket already has a comment logged', async () => {
    seedMarker({ id: 'H-1', startedAt: 1, commentLogged: true })
    expect(await decideStopAction(DATA_DIR, {})).toBeNull()
  })

  it('blocks the stop when the active ticket has no comment logged yet', async () => {
    seedMarker({ id: 'H-1', startedAt: 1, commentLogged: false })
    seedTodo('H-1')
    const result = await decideStopAction(DATA_DIR, {})
    expect(result?.decision).toBe('block')
    expect(result?.reason).toContain('H-1')
  })

  it('allows the stop when stop_hook_active is true, even with an unlogged active ticket', async () => {
    seedMarker({ id: 'H-1', startedAt: 1, commentLogged: false })
    seedTodo('H-1')
    expect(await decideStopAction(DATA_DIR, { stop_hook_active: true })).toBeNull()
  })

  it('allows the stop when the active ticket no longer exists (self-heals a dangling marker)', async () => {
    seedMarker({ id: 'H-1', startedAt: 1, commentLogged: false })
    expect(await decideStopAction(DATA_DIR, {})).toBeNull()
  })

  it('allows the stop when the active ticket has since been archived', async () => {
    seedMarker({ id: 'H-1', startedAt: 1, commentLogged: false })
    fsState.files.set(
      `${DATA_DIR}/todos.json`,
      JSON.stringify({
        projects: [],
        todos: [
          {
            id: 'H-1',
            projectId: 'p1',
            title: 'x',
            description: '',
            attachments: [],
            status: 'in_progress',
            archived: true,
            label: null,
            tags: [],
            prUrl: null,
            comments: [],
            author: 'developer',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      })
    )
    expect(await decideStopAction(DATA_DIR, {})).toBeNull()
  })
})
