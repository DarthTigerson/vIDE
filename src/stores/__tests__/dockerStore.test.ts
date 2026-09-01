import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDockerStore } from '../dockerStore'
import type { DockerContainer } from '@/types/api'

const container: DockerContainer = {
  id: 'a1',
  name: 'web',
  image: 'nginx',
  status: 'Up 2 hours',
  state: 'running',
  ports: '80/tcp',
}

vi.stubGlobal('window', {
  api: {
    dockerStatus: vi.fn().mockResolvedValue('running'),
    dockerListContainers: vi.fn().mockResolvedValue([container]),
    dockerStartContainer: vi.fn().mockResolvedValue({ ok: true }),
    dockerStopContainer: vi.fn().mockResolvedValue({ ok: true }),
    dockerRestartContainer: vi.fn().mockResolvedValue({ ok: true }),
    dockerRemoveContainer: vi.fn().mockResolvedValue({ ok: true }),
    dockerStartContainers: vi.fn().mockResolvedValue({ ok: true }),
    dockerStopContainers: vi.fn().mockResolvedValue({ ok: true }),
    dockerRemoveContainers: vi.fn().mockResolvedValue({ ok: true }),
    dockerOpenApp: vi.fn().mockResolvedValue({ ok: true }),
    dockerWatch: vi.fn(),
    dockerUnwatch: vi.fn(),
  },
})

describe('dockerStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useDockerStore.setState({ status: 'unknown', containers: [], loading: false, watching: false, watcherRefCount: 0 })
  })

  it('refresh() fetches status then containers only when running', async () => {
    await useDockerStore.getState().refresh()
    expect(useDockerStore.getState().status).toBe('running')
    expect(useDockerStore.getState().containers).toEqual([container])
  })

  it('refresh() skips listing containers when not running', async () => {
    ;(window.api.dockerStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce('stopped')
    await useDockerStore.getState().refresh()
    expect(useDockerStore.getState().status).toBe('stopped')
    expect(useDockerStore.getState().containers).toEqual([])
    expect(window.api.dockerListContainers).not.toHaveBeenCalled()
  })

  it('startContainer calls the IPC action then refreshes', async () => {
    const result = await useDockerStore.getState().startContainer('a1')
    expect(window.api.dockerStartContainer).toHaveBeenCalledWith('a1')
    expect(window.api.dockerStatus).toHaveBeenCalled()
    expect(result).toEqual({ ok: true })
  })

  it('removeContainer surfaces a failed result without throwing', async () => {
    ;(window.api.dockerRemoveContainer as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, error: 'in use' })
    const result = await useDockerStore.getState().removeContainer('a1')
    expect(result).toEqual({ ok: false, error: 'in use' })
  })

  it('startContainers calls the batch IPC action with all ids then refreshes', async () => {
    const result = await useDockerStore.getState().startContainers(['a1', 'b2'])
    expect(window.api.dockerStartContainers).toHaveBeenCalledWith(['a1', 'b2'])
    expect(window.api.dockerStatus).toHaveBeenCalled()
    expect(result).toEqual({ ok: true })
  })

  it('stopContainers calls the batch IPC action with all ids then refreshes', async () => {
    const result = await useDockerStore.getState().stopContainers(['a1', 'b2'])
    expect(window.api.dockerStopContainers).toHaveBeenCalledWith(['a1', 'b2'])
    expect(window.api.dockerStatus).toHaveBeenCalled()
    expect(result).toEqual({ ok: true })
  })

  it('removeContainers calls the batch IPC action with all ids then refreshes', async () => {
    const result = await useDockerStore.getState().removeContainers(['a1', 'b2'])
    expect(window.api.dockerRemoveContainers).toHaveBeenCalledWith(['a1', 'b2'])
    expect(window.api.dockerStatus).toHaveBeenCalled()
    expect(result).toEqual({ ok: true })
  })

  it('startWatching/stopWatching call the IPC watch channels once each', () => {
    useDockerStore.getState().startWatching()
    useDockerStore.getState().startWatching()
    expect(window.api.dockerWatch).toHaveBeenCalledTimes(1)

    useDockerStore.getState().stopWatching()
    useDockerStore.getState().stopWatching()
    expect(window.api.dockerUnwatch).toHaveBeenCalledTimes(1)
  })

  it('keeps watching alive while a second consumer (e.g. the logs tab) is still open', () => {
    // Simulates DockerPanel and a DockerLogsPage tab both mounted at once —
    // the panel unmounting first must not kill the still-open tab's stream.
    useDockerStore.getState().startWatching() // panel mounts
    useDockerStore.getState().startWatching() // logs tab mounts
    useDockerStore.getState().stopWatching() // panel unmounts
    expect(window.api.dockerUnwatch).not.toHaveBeenCalled()
    expect(useDockerStore.getState().watching).toBe(true)

    useDockerStore.getState().stopWatching() // logs tab unmounts
    expect(window.api.dockerUnwatch).toHaveBeenCalledTimes(1)
    expect(useDockerStore.getState().watching).toBe(false)
  })
})
