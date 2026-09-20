import { useEffect } from 'react'
import { useLlamaModelsStore } from '@/stores/llamaModelsStore'
import { useLlamaStore } from '@/stores/llamaStore'

// How many configured Llama models have a server running right now — what the
// activity bar's Llama badge shows.
//
// A server's running state is only known once something has probed it (or
// vIDE launched it itself), and LlamaPanel is the only other place that
// probes — so without this effect the count would read 0 after every launch
// until the panel was opened, even with servers already up from a prior
// session. Probing here (whenever the feature is on and the model list
// changes) keeps the badge honest without the panel.
export function useRunningLlamaCount(enabled: boolean): number {
  const models = useLlamaModelsStore((s) => s.models)
  const runs = useLlamaStore((s) => s.runs)
  const probeModel = useLlamaStore((s) => s.probeModel)

  useEffect(() => {
    if (!enabled) return
    for (const m of models) probeModel(m.id, m.host, m.port)
  }, [enabled, models, probeModel])

  return models.filter((m) => runs[m.id]?.running).length
}
