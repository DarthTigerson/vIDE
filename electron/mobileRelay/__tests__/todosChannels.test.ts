import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'

// Mock electron app module
vi.stubGlobal('__dirname', '/fake')
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/fake/userData'),
  },
  BrowserWindow: vi.fn(),
}))

// Mock the todosStore module entirely
vi.mock('../../todosStore', () => ({
  listProjects: vi.fn(async (dir: string) => [{ id: 'proj1', name: 'Work' }]),
  createProject: vi.fn(async (dir: string, name: string, key: string) => ({ id: 'proj2', name, key })),
  updateTodo: vi.fn(async (dir: string, id: string, patch: any) => ({ id, ...patch, updated: true })),
  listTodos: vi.fn(async (dir: string, projectId: string) => [{ id: 'todo1', title: 'Task 1', status: 'open' }]),
  attachmentsDir: vi.fn((dir: string) => `${dir}/attachments`),
}))

vi.mock('../../fsOps', () => ({
  readImageDataUrl: vi.fn(async (path: string) => 'data:image/png;base64,ABC123'),
}))

import { registerTodosRelayChannels } from '../channels/todosChannels'

describe('todosChannels', () => {
  beforeEach(() => {
    resetChannelsForTest()
    registerTodosRelayChannels()
  })

  it('maps todos:listProjects to store.listProjects', async () => {
    const res = await dispatch({ type: 'invoke', id: '1', method: 'todos:listProjects', args: [] })
    expect(res).toEqual({
      type: 'response',
      id: '1',
      result: [{ id: 'proj1', name: 'Work' }],
    })
  })

  it('maps todos:createProject with name and key args', async () => {
    const res = await dispatch({
      type: 'invoke',
      id: '2',
      method: 'todos:createProject',
      args: ['New Project', 'PROJECT_KEY']
    })
    expect(res).toEqual({
      type: 'response',
      id: '2',
      result: { id: 'proj2', name: 'New Project', key: 'PROJECT_KEY' },
    })
  })

  it('maps todos:updateTodo with id and patch in order', async () => {
    const patch = { title: 'Updated Task', status: 'done' as const }
    const res = await dispatch({
      type: 'invoke',
      id: '3',
      method: 'todos:updateTodo',
      args: ['todo1', patch]
    })
    expect(res).toEqual({
      type: 'response',
      id: '3',
      result: { id: 'todo1', ...patch, updated: true },
    })
  })

  it('maps todos:listTodos to store.listTodos', async () => {
    const res = await dispatch({
      type: 'invoke',
      id: '4',
      method: 'todos:listTodos',
      args: ['proj1']
    })
    expect(res).toEqual({
      type: 'response',
      id: '4',
      result: [{ id: 'todo1', title: 'Task 1', status: 'open' }],
    })
  })
})
