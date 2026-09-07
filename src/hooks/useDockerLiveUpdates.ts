import { useEffect } from 'react'
import { useDockerStore } from '@/stores/dockerStore'

const POLL_INTERVAL_MS = 5000
// `docker events` emits one line per container per lifecycle stage (create,
// attach, start, health_status, ...), so bringing up a compose stack fires a
// burst of these in a few seconds — and health checks keep emitting
// health_status events for as long as the stack runs. Debounce so a burst
// coalesces into a single refresh instead of spawning a `docker` CLI call
// per line, which was flooding the daemon enough to cause status flicker.
const CHANGE_DEBOUNCE_MS = 300

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
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const offChanged = window.api.onDockerChanged(() => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        refresh()
      }, CHANGE_DEBOUNCE_MS)
    })
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      refresh()
    }, POLL_INTERVAL_MS)
    return () => {
      offChanged()
      if (debounceTimer) clearTimeout(debounceTimer)
      clearInterval(interval)
      stopWatching()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
}
