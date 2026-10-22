import { create } from 'zustand'
import type { LlamaLaunchConfig } from '../../electron/llama'
import { appendCapped } from '../../electron/llamaLog'

// How much of the accumulated stderr/stdout to fold into the error banner on
// a non-zero exit, so the page shows the actual failure output (port already
// in use, model load errors, ...) rather than just an exit code. Same tail
// convention as graphifyStore.
const ERROR_TAIL_CHARS = 2000

interface LlamaRunState {
  running: boolean
  output: string
  error: string | null
  exitCode: number | null
  // vIDE started this server and holds its output (false: only the /health
  // probe knows it's up, e.g. it was started from a terminal).
  logged?: boolean
}

const EMPTY_RUN: LlamaRunState = { running: false, output: '', error: null, exitCode: null }

// Availability state for llama.cpp on this machine, probed once per panel
// mount via the main process (see electron/llama.ts). Same shape as
// graphifyStore's availability slice — the panel derives its UI from
// `available`/`checking` and never re-probes once a non-null value lands.
interface LlamaStore {
  available: boolean | null
  checking: boolean
  checkAvailable: () => Promise<void>

  // One managed llama-server process per model id — launch/stop/stream
  // lifecycle for the model editor page.
  runs: Record<string, LlamaRunState>
  startModel: (id: string, cfg: LlamaLaunchConfig) => Promise<void>
  stopModel: (id: string) => Promise<void>
  // Load the output the main process kept for a server vIDE started, e.g.
  // from another window or before a reload, and follow it from then on.
  attachModel: (id: string) => Promise<void>
  // Probe /health for a model that may have been started externally or in a
  // prior session, and sync runs[id].running without attaching IPC listeners.
  probeModel: (id: string, host: string, port: number) => Promise<void>
}

type SetState = (fn: (s: LlamaStore) => Partial<LlamaStore> | LlamaStore) => void

// One pair of listeners for every server: output arrives in every window, so
// whichever window shows the model page has it, not only the one that
// started the server.
let listening = false
function listen(set: SetState) {
  if (listening) return
  listening = true
  window.api.onLlamaData((id, data) => {
    set((s) => {
      const current = s.runs[id] ?? { ...EMPTY_RUN, running: true, logged: true }
      return { runs: { ...s.runs, [id]: { ...current, output: appendCapped(current.output, data) } } }
    })
  })
  window.api.onLlamaExit((id, code) => {
    set((s) => {
      const current = s.runs[id]
      if (!current) return s
      return {
        runs: {
          ...s.runs,
          [id]: {
            ...current,
            running: false,
            exitCode: code,
            // llama-server keeps running until stopped — a "successful"
            // launch only ever surfaces here as an error or an exit code
            // from a kill, so any non-zero close with output counts as an
            // error banner.
            error: code !== 0 && current.output ? current.output.slice(-ERROR_TAIL_CHARS) : null,
          },
        },
      }
    })
  })
}

export function _resetLlamaListenersForTesting(): void {
  listening = false
}

export const useLlamaStore = create<LlamaStore>((set, get) => ({
  available: null,
  checking: false,

  checkAvailable: async () => {
    // Guard against the panel's mount effect re-firing (it watches
    // `checking`, so a second call mid-probe would otherwise stack probes).
    if (get().checking) return
    set({ checking: true })
    try {
      const available = await window.api.llamaIsAvailable()
      set({ available, checking: false })
    } catch {
      // Must land on a non-null `available` — the panel re-probes whenever
      // `checking` flips back to false while `available` is still null, so
      // leaving it null on failure causes an infinite retry loop.
      set({ available: false, checking: false })
    }
  },

  runs: {},

  startModel: async (id, cfg) => {
    listen(set)
    set((s) => ({
      runs: { ...s.runs, [id]: { running: true, output: '', error: null, exitCode: null, logged: true } },
    }))
    try {
      await window.api.llamaStart(id, cfg)
    } catch (err) {
      set((s) => ({
        runs: {
          ...s.runs,
          [id]: { ...s.runs[id], running: false, error: err instanceof Error ? err.message : String(err) },
        },
      }))
    }
  },

  attachModel: async (id) => {
    listen(set)
    let log: { running: boolean; output: string } | null
    try {
      log = await window.api.llamaGetLog(id)
    } catch {
      return
    }
    if (!log) return
    const { running, output } = log
    // The snapshot already holds every chunk delivered before it, so it
    // replaces the local copy rather than adding to it.
    set((s) => ({
      runs: { ...s.runs, [id]: { ...(s.runs[id] ?? EMPTY_RUN), running, output, logged: true } },
    }))
  },

  stopModel: async (id) => {
    try {
      await window.api.llamaStop(id)
    } catch {}
  },

  probeModel: async (id, host, port) => {
    try {
      const resp = await fetch(`http://${host}:${port}/health`, { signal: AbortSignal.timeout(1500) })
      const running = resp.ok
      set((s) => {
        const current = s.runs[id]
        if (current?.running === running) return s
        return { runs: { ...s.runs, [id]: { ...(current ?? EMPTY_RUN), running } } }
      })
    } catch {
      // Unreachable — mark as not running only if we previously thought it was
      set((s) => {
        if (!s.runs[id]?.running) return s
        return { runs: { ...s.runs, [id]: { ...s.runs[id], running: false } } }
      })
    }
  },
}))
