import { create } from 'zustand'
import type { AssistantKind } from '@/types/api'
import { hueForInstanceIndex, nextHueForInstances } from '@/lib/claudeInstanceHues'

const ASSISTANT_KEY = 'vide-last-assistant'
const VALID: AssistantKind[] = ['claude', 'bridge']

function readStoredAssistant(): AssistantKind {
  try {
    const v = localStorage.getItem(ASSISTANT_KEY)
    return VALID.includes(v as AssistantKind) ? (v as AssistantKind) : 'claude'
  } catch {
    return 'claude'
  }
}

export interface ClaudeInstance {
  id: string
  hue: string
}

function createInstance(hue: string): ClaudeInstance {
  return { id: crypto.randomUUID(), hue }
}

interface ClaudeState {
  assistant: AssistantKind
  // The stacked Claude sessions. Starts empty — App.tsx populates it via
  // loadInstancesFromSession() once sessionLoad() resolves for the current
  // project, so no throwaway instance is ever created and then discarded.
  instances: ClaudeInstance[]
  activeInstanceId: string
  restartToken: number
  usageOpen: boolean
  costOpen: boolean
  chatVisible: boolean
  pendingInjection: string | null
  focusToken: number
  // Whether that instance's CLI is actively generating (electron/claude.ts
  // infers this from PTY output timing, filtering out echoes of the user's
  // own keystrokes — see the ECHO_WINDOW_MS comment there). Keyed by
  // instance id — Bridge never appears here, it never went through the
  // busy-tracking IPC channel.
  busyByInstance: Record<string, boolean>
  setAssistant: (assistant: AssistantKind) => void
  loadInstancesFromSession: (saved: ClaudeInstance[] | undefined) => void
  newSession: (cwd: string) => void
  previousSession: (cwd: string) => void
  resumeSession: (cwd: string) => void
  closeInstance: (cwd: string, id: string) => void
  setActiveInstance: (id: string) => void
  compact: () => void
  clearContext: () => void
  usage: () => void
  cost: () => void
  toggleChatVisible: () => void
  setChatVisible: (visible: boolean) => void
  sendSelection: (text: string) => void
  focusChat: () => void
  consumeInjection: () => void
  setBusy: (instanceId: string, busy: boolean) => void
}

export const useClaudeStore = create<ClaudeState>((set, get) => ({
  assistant: readStoredAssistant(),
  instances: [],
  activeInstanceId: '',
  restartToken: 0,
  usageOpen: false,
  costOpen: false,
  // Starts closed — App.tsx opens it automatically once a project resolves
  // (on launch restore or a fresh Open Folder), so there's no toggle to
  // click (or flash of an empty chat panel) before there's a project for it
  // to attach to.
  chatVisible: false,
  pendingInjection: null,
  focusToken: 0,
  busyByInstance: {},

  setBusy: (instanceId, busy) =>
    set((s) => ({ busyByInstance: { ...s.busyByInstance, [instanceId]: busy } })),

  setAssistant: (assistant: AssistantKind) => {
    try { localStorage.setItem(ASSISTANT_KEY, assistant) } catch {}
    set({ assistant })
  },

  loadInstancesFromSession: (saved) => {
    const validSaved = Array.isArray(saved)
      ? saved.filter((inst): inst is ClaudeInstance => typeof inst?.id === 'string' && typeof inst?.hue === 'string')
      : []
    const instances = validSaved.length > 0 ? validSaved : [createInstance(hueForInstanceIndex(0))]
    set({ instances, activeInstanceId: instances[0].id })
  },

  toggleChatVisible: () => set((s) => ({ chatVisible: !s.chatVisible })),

  setChatVisible: (visible) => set({ chatVisible: visible }),

  sendSelection: (text) => {
    set((s) => ({ chatVisible: true, pendingInjection: text, focusToken: s.focusToken + 1 }))
  },

  focusChat: () => {
    set((s) => ({ chatVisible: true, focusToken: s.focusToken + 1 }))
  },

  consumeInjection: () => set({ pendingInjection: null }),

  newSession: (cwd: string) => {
    const instances = get().instances
    const instance = createInstance(nextHueForInstances(instances))
    const nextInstances = [...instances, instance]
    set({ instances: nextInstances, activeInstanceId: instance.id })
    // Whole-file overwrite — fine today since claudeInstances is the only
    // field anything writes to session data, but a future feature that
    // starts persisting layout/tabs here would need a read-merge-write
    // instead, or its data will be silently erased on every "+"/close.
    window.api.sessionSave(cwd, { claudeInstances: nextInstances } as any)
  },

  previousSession: (cwd: string) => {
    set((s) => ({ restartToken: s.restartToken + 1 }))
    window.api.claudeSpawn(cwd, get().activeInstanceId, 'continue')
  },

  resumeSession: (cwd: string) => {
    set((s) => ({ restartToken: s.restartToken + 1 }))
    window.api.claudeSpawn(cwd, get().activeInstanceId, 'resume')
  },

  setActiveInstance: (id) => set({ activeInstanceId: id }),

  closeInstance: (cwd: string, id: string) => {
    const { instances, activeInstanceId } = get()
    if (instances.length <= 1) return
    const closedIndex = instances.findIndex((inst) => inst.id === id)
    if (closedIndex === -1) return

    const nextInstances = instances.filter((inst) => inst.id !== id)
    window.api.claudeKill(id)

    const nextActiveId = activeInstanceId === id
      ? nextInstances[Math.min(closedIndex, nextInstances.length - 1)].id
      : activeInstanceId

    set({ instances: nextInstances, activeInstanceId: nextActiveId })
    // Whole-file overwrite — see the comment in newSession() above.
    window.api.sessionSave(cwd, { claudeInstances: nextInstances } as any)
  },

  compact: () => {
    if (get().assistant === 'claude') window.api.claudeWrite(get().activeInstanceId, '/compact\r')
  },
  clearContext: () => {
    if (get().assistant === 'claude') window.api.claudeWrite(get().activeInstanceId, '/clear\r')
  },
  usage: () => {
    if (get().assistant !== 'claude') return
    // Usage and Cost are mutually exclusive — opening one closes the other,
    // so at most one of these bottom panels is ever showing at a time.
    set((s) => {
      const usageOpen = !s.usageOpen
      return { usageOpen, costOpen: usageOpen ? false : s.costOpen }
    })
  },
  cost: () => {
    if (get().assistant !== 'claude') return
    set((s) => {
      const costOpen = !s.costOpen
      return { costOpen, usageOpen: costOpen ? false : s.usageOpen }
    })
  },
}))
