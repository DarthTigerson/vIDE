import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDockerLiveUpdates } from '../useDockerLiveUpdates'
import { useDockerStore } from '@/stores/dockerStore'

function setup() {
  ;(global as any).window.api = {
    dockerStatus: vi.fn().mockResolvedValue('running'),
    dockerListContainers: vi.fn().mockResolvedValue([]),
    dockerWatch: vi.fn(),
    dockerUnwatch: vi.fn(),
    onDockerChanged: vi.fn().mockReturnValue(() => {}),
  }
  useDockerStore.setState({ status: 'unknown', containers: [], loading: false, watching: false, watcherRefCount: 0 })
}

describe('useDockerLiveUpdates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when disabled', () => {
    setup()
    renderHook(() => useDockerLiveUpdates(false))
    expect(window.api.dockerStatus).not.toHaveBeenCalled()
    expect(window.api.dockerWatch).not.toHaveBeenCalled()
  })

  it('refreshes and starts watching when enabled', () => {
    setup()
    renderHook(() => useDockerLiveUpdates(true))
    expect(window.api.dockerStatus).toHaveBeenCalled()
    expect(window.api.dockerWatch).toHaveBeenCalledTimes(1)
  })

  it('subscribes to onDockerChanged while enabled', () => {
    setup()
    renderHook(() => useDockerLiveUpdates(true))
    expect(window.api.onDockerChanged).toHaveBeenCalledTimes(1)
  })

  it('unwatches and unsubscribes on unmount', () => {
    setup()
    const { unmount } = renderHook(() => useDockerLiveUpdates(true))
    unmount()
    expect(window.api.dockerUnwatch).toHaveBeenCalledTimes(1)
  })

  it('two simultaneous consumers (e.g. App.tsx and the panel) only unwatch once the last one unmounts', () => {
    setup()
    const a = renderHook(() => useDockerLiveUpdates(true))
    const b = renderHook(() => useDockerLiveUpdates(true))
    // Ref-counted in the store: the second consumer's mount doesn't fire a
    // second dockerWatch — only the 0->1 edge does.
    expect(window.api.dockerWatch).toHaveBeenCalledTimes(1)

    a.unmount()
    expect(window.api.dockerUnwatch).not.toHaveBeenCalled()

    b.unmount()
    expect(window.api.dockerUnwatch).toHaveBeenCalledTimes(1)
  })

  it('starts watching once enabled flips from false to true', () => {
    setup()
    const { rerender } = renderHook(({ enabled }) => useDockerLiveUpdates(enabled), {
      initialProps: { enabled: false },
    })
    expect(window.api.dockerWatch).not.toHaveBeenCalled()

    rerender({ enabled: true })
    expect(window.api.dockerWatch).toHaveBeenCalledTimes(1)
  })
})
