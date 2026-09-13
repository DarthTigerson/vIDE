import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'

vi.mock('../../docker', () => ({
  checkDockerStatus: vi.fn(async () => 'running'),
  listContainers: vi.fn(async () => [{ id: 'abc123', name: 'test' }]),
  startContainer: vi.fn(async (id: string) => ({ ok: true, id })),
  stopContainer: vi.fn(async (id: string) => ({ ok: true, id })),
  restartContainer: vi.fn(async (id: string) => ({ ok: true, id })),
  removeContainer: vi.fn(async (id: string) => ({ ok: true, id })),
  startContainers: vi.fn(async (ids: string[]) => ({ ok: true, ids })),
  stopContainers: vi.fn(async (ids: string[]) => ({ ok: true, ids })),
  removeContainers: vi.fn(async (ids: string[]) => ({ ok: true, ids })),
  getContainerStats: vi.fn(async () => ({ 'abc123': { cpu: 0.5, memory: 1000000000 } })),
  openDockerApp: vi.fn(async () => ({ ok: true })),
  closeDockerApp: vi.fn(async () => ({ ok: true })),
}))

import { registerDockerRelayChannels } from '../channels/dockerChannels'

describe('dockerChannels', () => {
  beforeEach(() => {
    resetChannelsForTest()
    registerDockerRelayChannels()
  })

  it('maps docker:status to checkDockerStatus', async () => {
    const res = await dispatch({ type: 'invoke', id: '1', method: 'docker:status', args: [] })
    expect(res).toEqual({
      type: 'response',
      id: '1',
      result: 'running',
    })
  })

  it('maps docker:listContainers to listContainers', async () => {
    const res = await dispatch({ type: 'invoke', id: '2', method: 'docker:listContainers', args: [] })
    expect(res).toEqual({
      type: 'response',
      id: '2',
      result: [{ id: 'abc123', name: 'test' }],
    })
  })

  it('maps docker:startContainer to startContainer with id', async () => {
    const res = await dispatch({ type: 'invoke', id: '3', method: 'docker:startContainer', args: ['abc123'] })
    expect(res).toEqual({
      type: 'response',
      id: '3',
      result: { ok: true, id: 'abc123' },
    })
  })

  it('maps docker:openApp to openDockerApp', async () => {
    const res = await dispatch({ type: 'invoke', id: '4', method: 'docker:openApp', args: [] })
    expect(res).toEqual({
      type: 'response',
      id: '4',
      result: { ok: true },
    })
  })
})
