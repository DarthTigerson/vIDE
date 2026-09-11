import { useEffect, useRef } from 'react'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { useGraphifyStore } from '@/stores/graphifyStore'

// VIDE-27: auto-build the graph the first time a repo becomes active this
// session, when the user has opted in via Settings > Graphify. Off by
// default — building spawns a real CLI process and can take a while, so it
// shouldn't run silently in the background for every repo someone opens
// unless asked for. Only checks graphify's availability once this setting is
// actually on, so opting out means zero extra process spawns. `activeRepo`
// is the same "which repo is actually being worked on" signal the
// activity-bar badge and GraphifyPanel use (useActiveRepo in gitReposStore).
export function useGraphifyAutoBuild(activeRepo: string | null) {
  const graphifyEnabled = useGraphifySettingsStore((s) => s.enabled)
  const autoBuildOnOpen = useGraphifySettingsStore((s) => s.autoBuildOnOpen)
  const available = useGraphifyStore((s) => s.available)
  const checking = useGraphifyStore((s) => s.checking)
  const running = useGraphifyStore((s) => s.running)
  const autoBuiltReposRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!graphifyEnabled || !autoBuildOnOpen) return
    if (available === null) {
      if (!checking) useGraphifyStore.getState().checkAvailable()
      return
    }
    if (!available || !activeRepo || running) return
    if (autoBuiltReposRef.current.has(activeRepo)) return
    autoBuiltReposRef.current.add(activeRepo)
    useGraphifyStore.getState().run(activeRepo)
  }, [graphifyEnabled, autoBuildOnOpen, available, checking, activeRepo, running])
}
