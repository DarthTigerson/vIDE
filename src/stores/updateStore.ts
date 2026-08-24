import { create } from 'zustand'
import { useEditorStore } from './editorStore'
import { buildTerminalPath } from '@/components/Settings/paths'
import { pendingTerminalCommands } from '@/components/Terminal/TerminalTab'
import { PENDING_CHANGELOG_KEY } from './changelogStore'
import type { UpdateInfo } from '@/types/api'

const SENTINEL_PREFIX = '__VIDE_UPDATE_EXIT_'
const UPDATE_COMMAND =
  `VIDE_NO_LAUNCH=1 curl -fsSL https://raw.githubusercontent.com/DarthTigerson/vIDE/main/install.sh | bash; ` +
  `echo "${SENTINEL_PREFIX}$?__"\n`

export type UpdateStatus = 'idle' | 'updating' | 'ready' | 'failed'

const UP_TO_DATE_DISPLAY_MS = 4000

interface UpdateState {
  available: UpdateInfo | null
  status: UpdateStatus
  upToDateVersion: string | null
  setAvailable: (info: UpdateInfo | null) => void
  showUpToDate: (version: string) => void
  startUpdate: () => void
  restart: () => void
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  available: null,
  status: 'idle',
  upToDateVersion: null,

  setAvailable: (info) => set({ available: info }),

  showUpToDate: (version) => {
    set({ upToDateVersion: version })
    setTimeout(() => {
      if (get().upToDateVersion === version) set({ upToDateVersion: null })
    }, UP_TO_DATE_DISPLAY_MS)
  },

  startUpdate: () => {
    if (get().status === 'updating') return
    set({ status: 'updating' })

    const id = Date.now().toString(36)
    pendingTerminalCommands.set(id, UPDATE_COMMAND)
    useEditorStore.getState().openTab({ path: buildTerminalPath(id), content: '', dirty: false })

    let buffer = ''
    const unsubscribe = window.api.onTermData((termId, data) => {
      if (termId !== id) return
      buffer = (buffer + data).slice(-500)
      const match = buffer.match(new RegExp(`${SENTINEL_PREFIX}(\\d+)__`))
      if (match) {
        unsubscribe()
        set({ status: match[1] === '0' ? 'ready' : 'failed' })
      }
    })
  },

  restart: () => {
    const version = get().available?.version
    if (version) localStorage.setItem(PENDING_CHANGELOG_KEY, version)
    window.api.updateRestart()
  },
}))
