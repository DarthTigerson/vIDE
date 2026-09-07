import { create } from 'zustand'
import type { DockerStatus, DockerContainer, DockerActionResult, DockerContainerStats } from '@/types/api'

interface DockerStore {
  status: DockerStatus | 'unknown'
  containers: DockerContainer[]
  // Memory stats keyed by container id — fetched separately from
  // refresh()/containers since `docker stats` is a much heavier call, so
  // it's only ever populated while a consumer opts in via refreshStats().
  containerStats: Record<string, DockerContainerStats>
  loading: boolean
  watching: boolean
  // Both DockerPanel and a DockerLogsPage tab can be mounted at once and
  // each wants the shared `docker events` stream alive for as long as it's
  // open — a plain boolean would have the second consumer's unmount kill
  // watching out from under the first, so this counts live subscribers and
  // only calls the IPC watch/unwatch channels on the 0->1 / 1->0 edges.
  watcherRefCount: number
  refresh: () => Promise<void>
  refreshStats: () => Promise<void>
  startContainer: (id: string) => Promise<DockerActionResult>
  stopContainer: (id: string) => Promise<DockerActionResult>
  restartContainer: (id: string) => Promise<DockerActionResult>
  removeContainer: (id: string) => Promise<DockerActionResult>
  startContainers: (ids: string[]) => Promise<DockerActionResult>
  stopContainers: (ids: string[]) => Promise<DockerActionResult>
  removeContainers: (ids: string[]) => Promise<DockerActionResult>
  openApp: () => Promise<DockerActionResult>
  closeApp: () => Promise<DockerActionResult>
  startWatching: () => void
  stopWatching: () => void
}

export const useDockerStore = create<DockerStore>((set, get) => {
  // `docker events` can fire refresh() several times in quick succession
  // (see useDockerLiveUpdates), and under compose-up load the underlying
  // `docker info`/`docker ps` calls don't always resolve in the order they
  // were issued. Without this guard a stale, slow-to-resolve refresh could
  // overwrite a fresher one that already landed, producing exactly the
  // running/stopped flicker this token prevents.
  let refreshToken = 0

  return {
    status: 'unknown',
    containers: [],
    containerStats: {},
    loading: false,
    watching: false,
    watcherRefCount: 0,

    refresh: async () => {
      const token = ++refreshToken
      set({ loading: true })
      const status = await window.api.dockerStatus()
      // 'unknown' means the status check itself timed out under load (see
      // checkDockerStatus in electron/docker.ts) rather than confirming
      // Docker is actually down — keep whatever we last confirmed instead of
      // flickering the UI to "stopped" on a transient blip.
      if (status === 'unknown') {
        if (token !== refreshToken) return
        set({ loading: false })
        return
      }
      const containers = status === 'running' ? await window.api.dockerListContainers() : []
      if (token !== refreshToken) return
      set({ status, containers, loading: false })
    },

    refreshStats: async () => {
      if (get().status !== 'running') return
      const containerStats = await window.api.dockerGetContainerStats()
      set({ containerStats })
    },

    startContainer: async (id) => {
      const result = await window.api.dockerStartContainer(id)
      await get().refresh()
      return result
    },
    stopContainer: async (id) => {
      const result = await window.api.dockerStopContainer(id)
      await get().refresh()
      return result
    },
    restartContainer: async (id) => {
      const result = await window.api.dockerRestartContainer(id)
      await get().refresh()
      return result
    },
    removeContainer: async (id) => {
      const result = await window.api.dockerRemoveContainer(id)
      await get().refresh()
      return result
    },
    startContainers: async (ids) => {
      const result = await window.api.dockerStartContainers(ids)
      await get().refresh()
      return result
    },
    stopContainers: async (ids) => {
      const result = await window.api.dockerStopContainers(ids)
      await get().refresh()
      return result
    },
    removeContainers: async (ids) => {
      const result = await window.api.dockerRemoveContainers(ids)
      await get().refresh()
      return result
    },
    openApp: async () => {
      const result = await window.api.dockerOpenApp()
      await get().refresh()
      return result
    },
    closeApp: async () => {
      const result = await window.api.dockerCloseApp()
      await get().refresh()
      return result
    },

    startWatching: () => {
      const count = get().watcherRefCount + 1
      set({ watcherRefCount: count })
      if (count === 1) {
        set({ watching: true })
        window.api.dockerWatch()
      }
    },
    stopWatching: () => {
      const count = Math.max(0, get().watcherRefCount - 1)
      set({ watcherRefCount: count })
      if (count === 0) {
        set({ watching: false })
        window.api.dockerUnwatch()
      }
    },
  }
})
