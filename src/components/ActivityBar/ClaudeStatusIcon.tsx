import { useEffect, useState } from 'react'
import { useClaudeStore } from '@/stores/claudeStore'
import { ClaudeIcon } from './ActivityBar'
import { pickClaudeGif } from '@/assets/claudeGifs'

const CYCLE_INTERVAL_MS = 60_000

// Swaps the static Claude logo for a randomly-picked looping gif whenever
// electron/claude.ts reports this specific instance as busy (see its
// ECHO_WINDOW_MS comment for how "busy" is inferred from PTY output
// timing), re-rolling the pick every minute so a long-running turn doesn't
// just freeze on one animation. The gif itself is fixed brand-colored art
// and isn't tinted per instance — only the idle static icon is.
export function ClaudeStatusIcon({ instanceId, color }: { instanceId: string; color: string }) {
  const busy = useClaudeStore((s) => s.busyByInstance[instanceId] ?? false)
  const [gif, setGif] = useState<string | null>(null)

  useEffect(() => {
    if (!busy) {
      setGif(null)
      return
    }
    setGif(pickClaudeGif())
    const interval = setInterval(() => setGif(pickClaudeGif()), CYCLE_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [busy])

  if (busy && gif) {
    return <img src={gif} alt="Claude is working" className="w-[1.375rem] h-[1.375rem] object-contain" />
  }
  return <ClaudeIcon color={color} />
}
