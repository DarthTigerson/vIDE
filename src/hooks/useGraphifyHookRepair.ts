import { useEffect, useRef } from 'react'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'

// Once per repo per session, asks the main process to re-run graphify's
// Claude Code install if the project uses graphify (skill installed and
// graphify-out/ present) and its .claude/settings.json hooks point at
// a graphify binary missing on this machine (e.g. a teammate's absolute path
// was committed). The check is a file read; the install only runs when a
// hook is actually broken.
export function useGraphifyHookRepair(activeRepo: string | null) {
  const graphifyEnabled = useGraphifySettingsStore((s) => s.enabled)
  const checkedReposRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!graphifyEnabled || !activeRepo) return
    if (checkedReposRef.current.has(activeRepo)) return
    checkedReposRef.current.add(activeRepo)
    window.api.graphifyRepairHooksIfNeeded(activeRepo).catch(() => {})
  }, [graphifyEnabled, activeRepo])
}
