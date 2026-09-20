import { useEffect } from 'react'
import { useLlamaStore } from '@/stores/llamaStore'

// Whether llama.cpp is installed (null until probed). LlamaPanel probes it
// too, but only once it has been opened — the footer notification for a
// missing llama.cpp needs the answer without the panel, so App probes here
// when the Llama feature is on. checkAvailable guards against stacking probes.
export function useLlamaAvailability(enabled: boolean): boolean | null {
  const available = useLlamaStore((s) => s.available)
  const checking = useLlamaStore((s) => s.checking)
  const checkAvailable = useLlamaStore((s) => s.checkAvailable)

  useEffect(() => {
    if (enabled && available === null && !checking) checkAvailable()
  }, [enabled, available, checking, checkAvailable])

  return available
}
