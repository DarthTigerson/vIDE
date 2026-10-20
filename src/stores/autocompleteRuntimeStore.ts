import { create } from 'zustand'
import type { AutocompleteRuntimeState } from '@/types/api'

const IDLE: AutocompleteRuntimeState = {
  phase: 'idle', source: null, modelOnDisk: false, progress: null, ramBytes: null, error: null,
}

interface AutocompleteRuntimeStore {
  // Mirror of the main process's AutocompleteManager state (pushed on change).
  state: AutocompleteRuntimeState
  // A completion request is in flight (the footer icon's busy animation).
  busy: boolean
  // Snooze keeps the model loaded but shows no suggestions. Session-only by
  // design: never persisted, so a relaunch always starts un-snoozed.
  snoozedUntil: number | 'resume' | null
  init: () => void
  snooze: (minutes: 15 | 60 | 'resume') => void
  resume: () => void
  isSnoozed: (now?: number) => boolean
  setBusy: (busy: boolean) => void
}

let initialized = false
let wakeTimer: ReturnType<typeof setTimeout> | null = null

function clearWakeTimer(): void {
  if (wakeTimer) clearTimeout(wakeTimer)
  wakeTimer = null
}

export const useAutocompleteRuntimeStore = create<AutocompleteRuntimeStore>((set, get) => ({
  state: IDLE,
  busy: false,
  snoozedUntil: null,

  init: () => {
    if (initialized) return
    initialized = true
    window.api.onAutocompleteState((state) => set({ state }))
    window.api.autocompleteGetState().then((state) => set({ state })).catch(() => {})
  },

  snooze: (minutes) => {
    clearWakeTimer()
    if (minutes === 'resume') {
      set({ snoozedUntil: 'resume' })
      return
    }
    const ms = minutes * 60_000
    set({ snoozedUntil: Date.now() + ms })
    wakeTimer = setTimeout(() => { wakeTimer = null; set({ snoozedUntil: null }) }, ms)
  },

  resume: () => {
    clearWakeTimer()
    set({ snoozedUntil: null })
  },

  isSnoozed: (now = Date.now()) => {
    const until = get().snoozedUntil
    return until === 'resume' || (typeof until === 'number' && now < until)
  },

  setBusy: (busy) => set({ busy }),
}))
