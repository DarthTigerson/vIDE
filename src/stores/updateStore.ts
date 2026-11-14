import { create } from 'zustand'
import { useEditorStore } from './editorStore'
import { UPDATE_TAB_PATH } from '@/components/Settings/paths'
import { PENDING_CHANGELOG_KEY, UPDATED_FROM_KEY } from './changelogStore'
import { stageFromLine, failureFromLog, changelogBody, type UpdateStage, type UpdateFailure } from '@/lib/updateStage'
import type { UpdateInfo } from '@/types/api'
import { usePeekEventStore } from './peekEventStore'

export type UpdateStatus = 'idle' | 'updating' | 'ready' | 'failed'

export interface UpdateLogLine {
  line: string
  stream: 'stdout' | 'stderr'
}

interface UpdateState {
  available: UpdateInfo | null
  status: UpdateStatus
  // Where an in-flight update is, read from install.sh's messages.
  stage: UpdateStage | null
  failure: UpdateFailure | null
  log: UpdateLogLine[]
  // The new version's CHANGELOG section for the Update page's "What's new":
  // undefined while loading, null if it couldn't be fetched.
  changelog: string | null | undefined
  // Settings > About's Check for updates (VIDE-143).
  checking: boolean
  lastCheckedAt: number | null
  checkFailed: boolean
  loadCheckStatus: () => void
  checkForUpdates: () => Promise<void>
  setAvailable: (info: UpdateInfo | null) => void
  showUpToDate: (version: string) => void
  openUpdatePage: () => void
  startUpdate: () => void
  restart: () => void
}

let unsubscribe: (() => void) | null = null

export const useUpdateStore = create<UpdateState>((set, get) => ({
  available: null,
  status: 'idle',
  stage: null,
  failure: null,
  log: [],
  changelog: undefined,
  checking: false,
  lastCheckedAt: null,
  checkFailed: false,

  loadCheckStatus: () => {
    window.api.updateGetStatus().then((status) => {
      if (get().checking) return
      set({ lastCheckedAt: status.lastCheckedAt, checkFailed: status.failed })
    }, () => {})
  },

  checkForUpdates: async () => {
    if (get().checking) return
    set({ checking: true })
    try {
      const status = await window.api.updateCheck()
      set({ checking: false, available: status.latest, lastCheckedAt: status.lastCheckedAt, checkFailed: status.failed })
    } catch {
      set({ checking: false, checkFailed: true })
    }
  },

  setAvailable: (info) => set({ available: info }),

  showUpToDate: (version) => {
    usePeekEventStore.getState().show(`You're on the latest version — v${version}`, 'update')
  },

  // Opens the Update tab (VIDE-142) and starts fetching what's new, without
  // starting the update itself.
  openUpdatePage: () => {
    useEditorStore.getState().openTab({ path: UPDATE_TAB_PATH, content: '', dirty: false })
    const version = get().available?.version
    if (version && get().changelog === undefined) {
      window.api.updateGetRemoteChangelog(version).then((section) => {
        if (get().available?.version === version) set({ changelog: section ? changelogBody(section) : null })
      }, () => set({ changelog: null }))
    }
  },

  startUpdate: () => {
    if (get().status === 'updating') return
    get().openUpdatePage()
    set({ status: 'updating', stage: 'download', failure: null, log: [] })

    unsubscribe?.()
    const offOutput = window.api.onUpdateOutput((out) => {
      const stage = stageFromLine(out.line)
      set((s) => ({ log: [...s.log, out], stage: stage ?? s.stage }))
    })
    const offExit = window.api.onUpdateExit((code) => {
      offOutput()
      offExit()
      unsubscribe = null
      if (code === 0) set({ status: 'ready', stage: null })
      else set((s) => ({ status: 'failed', failure: failureFromLog(s.log.map((l) => l.line)) }))
    })
    unsubscribe = () => {
      offOutput()
      offExit()
    }

    window.api.updateRun().catch((e: unknown) => {
      unsubscribe?.()
      unsubscribe = null
      set((s) => ({
        status: 'failed',
        failure: 'error',
        log: [...s.log, { line: `Couldn't start the update: ${e instanceof Error ? e.message : String(e)}`, stream: 'stderr' }],
      }))
    })
  },

  restart: () => {
    const version = get().available?.version
    if (version) {
      localStorage.setItem(PENDING_CHANGELOG_KEY, version)
      // The version being replaced, so About can say "Updated from v…".
      if (typeof __APP_VERSION__ === 'string') localStorage.setItem(UPDATED_FROM_KEY, __APP_VERSION__)
    }
    window.api.updateRestart()
  },
}))
