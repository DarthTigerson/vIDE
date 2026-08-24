import { create } from 'zustand'
import { useBridgeSettingsStore } from './bridgeSettingsStore'
import type { BridgeEvent, BridgeMessage } from '@/types/api'

const AGENT_MODE_KEY = 'vide:bridge:agentMode'
const CURRENT_SESSION_KEY = 'vide:bridge:current'
const SESSIONS_KEY = 'vide:bridge:sessions'

function newSessionId(): string {
  return `vide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export interface StoredSession {
  id: string
  messages: BridgeChatMessage[]
  timestamp: number
  title: string
}

function loadCurrentSession(): { id: string; messages: BridgeChatMessage[] } | null {
  try {
    const raw = localStorage.getItem(CURRENT_SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function loadStoredSessions(): StoredSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function persistCurrentSession(id: string, messages: BridgeChatMessage[]) {
  try { localStorage.setItem(CURRENT_SESSION_KEY, JSON.stringify({ id, messages })) } catch {}
}

function saveSessionToHistory(session: StoredSession) {
  try {
    const sessions = loadStoredSessions()
    const idx = sessions.findIndex(s => s.id === session.id)
    if (idx !== -1) sessions[idx] = session
    else sessions.unshift(session)
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, 20)))
  } catch {}
}

export interface BridgeToolCallBlock {
  id: string
  name: string
  args: Record<string, unknown>
  status: 'pending-approval' | 'running' | 'done' | 'error'
  result?: string
}

export interface BridgeChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: BridgeToolCallBlock[]
}

function getAgentMode(): boolean {
  try {
    return localStorage.getItem(AGENT_MODE_KEY) === 'true'
  } catch {
    return false
  }
}

function toWireMessages(messages: BridgeChatMessage[]): BridgeMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }))
}

interface BridgeStore {
  messages: BridgeChatMessage[]
  previousMessages: BridgeChatMessage[]
  sessionId: string
  sessions: StoredSession[]
  showSessionPicker: boolean
  agentMode: boolean
  streaming: boolean
  draftInput: string
  sendMessage: (cwd: string, text: string) => void
  regenerate: (cwd: string, messageIndex: number) => void
  newSession: () => void
  previousSession: () => void
  openSessionPicker: () => void
  restoreSession: (id: string) => void
  toggleAgentMode: () => void
  approveToolCall: (id: string) => void
  rejectToolCall: (id: string) => void
  cancel: () => void
  initEventListener: () => () => void
  setDraftInput: (text: string) => void
  appendDraftInput: (text: string) => void
}

const _saved = loadCurrentSession()

export const useBridgeStore = create<BridgeStore>((set, get) => ({
  messages: _saved?.messages ?? [],
  previousMessages: [],
  sessionId: _saved?.id ?? newSessionId(),
  sessions: loadStoredSessions(),
  showSessionPicker: false,
  agentMode: getAgentMode(),
  streaming: false,
  draftInput: '',

  sendMessage: (cwd, text) => {
    const userMessage: BridgeChatMessage = { role: 'user', content: text }
    const messages = [...get().messages, userMessage]
    set({ messages, streaming: true })

    const settings = useBridgeSettingsStore.getState()
    window.api.bridgeSend(cwd, toWireMessages(messages), get().agentMode, {
      endpoint: settings.endpoint,
      apiKey: settings.apiKey,
      modelId: settings.modelId,
      sessionId: get().sessionId,
    })
  },

  regenerate: (cwd, messageIndex) => {
    const all = get().messages
    const target = all[messageIndex]
    if (!target || target.role !== 'user') return
    const history = all.slice(0, messageIndex)
    const messages = [...history, { role: 'user' as const, content: target.content }]
    set({ messages, streaming: true })

    const settings = useBridgeSettingsStore.getState()
    window.api.bridgeSend(cwd, toWireMessages(messages), get().agentMode, {
      endpoint: settings.endpoint,
      apiKey: settings.apiKey,
      modelId: settings.modelId,
      sessionId: get().sessionId,
    })
  },

  newSession: () => {
    const { sessionId, messages } = get()
    if (messages.length > 0) {
      const title = messages.find(m => m.role === 'user')?.content?.slice(0, 80) ?? 'Untitled'
      saveSessionToHistory({ id: sessionId, messages, timestamp: Date.now(), title })
    }
    const newId = newSessionId()
    persistCurrentSession(newId, [])
    set((s) => ({ previousMessages: s.messages, messages: [], sessionId: newId, sessions: loadStoredSessions(), showSessionPicker: false }))
  },

  previousSession: () => {
    set((s) => ({ messages: s.previousMessages, showSessionPicker: false }))
  },

  openSessionPicker: () => set((s) => ({ showSessionPicker: !s.showSessionPicker })),

  restoreSession: (id: string) => {
    const session = get().sessions.find(s => s.id === id)
    if (!session) return
    persistCurrentSession(session.id, session.messages)
    set({ messages: session.messages, sessionId: session.id, showSessionPicker: false })
  },

  toggleAgentMode: () => {
    const next = !get().agentMode
    try { localStorage.setItem(AGENT_MODE_KEY, String(next)) } catch {}
    set({ agentMode: next })
  },

  approveToolCall: (id) => window.api.bridgeApprove(id),
  rejectToolCall: (id) => window.api.bridgeReject(id),
  cancel: () => {
    window.api.bridgeCancel()
    set({ streaming: false })
  },

  initEventListener: () => {
    return window.api.onBridgeEvent((event: BridgeEvent) => {
      handleEvent(event, set, get)
    })
  },

  setDraftInput: (text) => set({ draftInput: text }),
  appendDraftInput: (text) =>
    set((s) => ({ draftInput: s.draftInput ? `${s.draftInput}\n${text}` : text })),
}))

function ensureAssistantMessage(messages: BridgeChatMessage[]): BridgeChatMessage[] {
  const last = messages[messages.length - 1]
  if (last && last.role === 'assistant') return messages
  return [...messages, { role: 'assistant', content: '' }]
}

function handleEvent(
  event: BridgeEvent,
  set: (partial: Partial<BridgeStore>) => void,
  get: () => BridgeStore
): void {
  const messages = ensureAssistantMessage(get().messages)
  const last = { ...messages[messages.length - 1] }

  switch (event.type) {
    case 'new-turn': {
      const current = get().messages
      const tail = current[current.length - 1]
      // Don't push if there's already an empty assistant placeholder
      if (tail?.role === 'assistant' && !tail.content && !tail.toolCalls?.length) return
      set({ messages: [...current, { role: 'assistant', content: '' }] })
      return
    }
    case 'text-delta': {
      last.content += event.delta
      set({ messages: [...messages.slice(0, -1), last] })
      return
    }
    case 'content-replace': {
      last.content = event.content
      set({ messages: [...messages.slice(0, -1), last] })
      return
    }
    case 'tool-call': {
      last.toolCalls = [...(last.toolCalls ?? []), { id: event.id, name: event.name, args: event.args, status: 'running' }]
      set({ messages: [...messages.slice(0, -1), last] })
      return
    }
    case 'need-approval': {
      last.toolCalls = (last.toolCalls ?? []).map((tc) =>
        tc.id === event.id ? { ...tc, status: 'pending-approval' as const } : tc
      )
      set({ messages: [...messages.slice(0, -1), last] })
      return
    }
    case 'tool-result': {
      last.toolCalls = (last.toolCalls ?? []).map((tc) =>
        tc.id === event.id ? { ...tc, status: event.isError ? ('error' as const) : ('done' as const), result: event.result } : tc
      )
      set({ messages: [...messages.slice(0, -1), last] })
      return
    }
    case 'done': {
      set({ streaming: false })
      const { sessionId, messages: finalMessages } = get()
      persistCurrentSession(sessionId, finalMessages)
      return
    }
    case 'error': {
      last.content += `\n\n**Error:** ${event.message}`
      set({ messages: [...messages.slice(0, -1), last], streaming: false })
      return
    }
  }
}
