import { create } from 'zustand'
import type { AssistantKind } from '@/types/api'

const ASSISTANT_KEY = 'vide-last-assistant'
const VALID: AssistantKind[] = ['claude', 'codex', 'bridge']

function readStoredAssistant(): AssistantKind {
  try {
    const v = localStorage.getItem(ASSISTANT_KEY)
    return VALID.includes(v as AssistantKind) ? (v as AssistantKind) : 'claude'
  } catch {
    return 'claude'
  }
}

interface ClaudeState {
  assistant: AssistantKind
  restartToken: number
  usageOpen: boolean
  chatVisible: boolean
  pendingInjection: string | null
  focusToken: number
  // Whether that assistant's CLI is actively generating (electron/claude.ts
  // infers this from PTY output timing, filtering out echoes of the user's
  // own keystrokes — see the ECHO_WINDOW_MS comment there).
  busyByAssistant: Partial<Record<AssistantKind, boolean>>
  setAssistant: (assistant: AssistantKind) => void
  newSession: (cwd: string) => void
  previousSession: (cwd: string) => void
  compact: () => void
  clearContext: () => void
  usage: () => void
  model: () => void
  fast: () => void
  toggleChatVisible: () => void
  setChatVisible: (visible: boolean) => void
  sendSelection: (text: string) => void
  focusChat: () => void
  consumeInjection: () => void
  setBusy: (assistant: AssistantKind, busy: boolean) => void
}

export const useClaudeStore = create<ClaudeState>((set, get) => ({
  assistant: readStoredAssistant(),
  restartToken: 0,
  usageOpen: false,
  // Starts closed — App.tsx opens it automatically once a project resolves
  // (on launch restore or a fresh Open Folder), so there's no toggle to
  // click (or flash of an empty chat panel) before there's a project for it
  // to attach to.
  chatVisible: false,
  pendingInjection: null,
  focusToken: 0,
  busyByAssistant: {},

  setBusy: (assistant, busy) =>
    set((s) => ({ busyByAssistant: { ...s.busyByAssistant, [assistant]: busy } })),

  setAssistant: (assistant: AssistantKind) => {
    try { localStorage.setItem(ASSISTANT_KEY, assistant) } catch {}
    set({ assistant })
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
    set((s) => ({ restartToken: s.restartToken + 1 }))
    window.api.assistantSpawn(cwd, useClaudeStore.getState().assistant, 'new')
  },

  previousSession: (cwd: string) => {
    set((s) => ({ restartToken: s.restartToken + 1 }))
    window.api.assistantSpawn(cwd, useClaudeStore.getState().assistant, 'continue')
  },

  compact: () => {
    if (useClaudeStore.getState().assistant === 'claude') window.api.assistantWrite('claude', '/compact\r')
  },
  clearContext: () => {
    if (useClaudeStore.getState().assistant === 'claude') window.api.assistantWrite('claude', '/clear\r')
  },
  usage: () => {
    if (get().assistant !== 'claude') return
    set((s) => ({ usageOpen: !s.usageOpen }))
  },
  model: () => window.api.assistantWrite('codex', '/model\r'),
  fast: () => window.api.assistantWrite('codex', '/fast\r'),
}))
