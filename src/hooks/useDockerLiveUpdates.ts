import { useEffect } from 'react'
import { useDockerStore } from '@/stores/dockerStore'

const POLL_INTERVAL_MS = 5000

// Keeps Docker status/container state fresh independent of whether the
// Docker panel itself is mounted, so consumers like the activity-bar's
// running-container badge stay accurate even while the panel is closed.
// watch/unwatch is ref-counted in the store, so this composes safely with
// the panel calling the same hook while it's also open.
export function useDockerLiveUpdates(enabled: boolean) {
  const refresh = useDockerStore((s) => s.refresh)
  const startWatching = useDockerStore((s) => s.startWatching)
  const stopWatching = useDockerStore((s) => s.stopWatching)

  useEffect(() => {
    if (!enabled) return
    refresh()
    startWatching()
    const offChanged = window.api.onDockerChanged(() => refresh())
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      refresh()
    }, POLL_INTERVAL_MS)
    return () => {
      offChanged()
      clearInterval(interval)
      stopWatching()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
}
