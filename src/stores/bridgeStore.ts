import { create } from 'zustand'
import { useBridgeSettingsStore } from './bridgeSettingsStore'
import type { BridgeMessage, BridgeSessionEvent } from '@/types/api'

// Pre-multi-session key: one global conversation. Migrated into history once
// at import (see migrateLegacyCurrent) and then deleted.
const LEGACY_CURRENT_KEY = 'vide:bridge:current'
const HISTORY_KEY = 'vide:bridge:sessions'
const CONV_KEY_PREFIX = 'vide:bridge:conv:'
const HISTORY_LIMIT = 20

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

export interface StoredSession {
  id: string
  messages: BridgeChatMessage[]
  timestamp: number
  title: string
}

export interface BridgeConversation {
  messages: BridgeChatMessage[]
  // Id this transcript is archived under in history, and the
  // X-Bridge-Session-ID header value. Distinct from the agent-session id
  // (the conversations map key), which never changes for an activity-bar
  // icon even when Clear/Restore swap the transcript underneath it.
  historyId: string
  agentMode: boolean
  streaming: boolean
  draftInput: string
}

type ConnectionOverride = { endpoint: string; apiKey: string; modelId: string }

function newHistoryId(): string {
  return `vide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function loadHistory(): StoredSession[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveHistory(history: StoredSession[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT))) } catch {}
}

function withArchived(history: StoredSession[], historyId: string, messages: BridgeChatMessage[]): StoredSession[] {
  if (messages.length === 0) return history
  const title = messages.find((m) => m.role === 'user')?.content?.slice(0, 80) ?? 'Untitled'
  const entry: StoredSession = { id: historyId, messages, timestamp: Date.now(), title }
  return [entry, ...history.filter((s) => s.id !== historyId)].slice(0, HISTORY_LIMIT)
}

function loadPersisted(sessionId: string): { historyId: string; messages: BridgeChatMessage[] } | null {
  try {
    const raw = localStorage.getItem(CONV_KEY_PREFIX + sessionId)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.historyId !== 'string' || !Array.isArray(parsed?.messages)) return null
    return parsed
  } catch { return null }
}

function persist(sessionId: string, conv: BridgeConversation) {
  try {
    localStorage.setItem(CONV_KEY_PREFIX + sessionId, JSON.stringify({ historyId: conv.historyId, messages: conv.messages }))
  } catch {}
}

function forgetPersisted(sessionId: string) {
  try { localStorage.removeItem(CONV_KEY_PREFIX + sessionId) } catch {}
}

function migrateLegacyCurrent(): StoredSession[] {
  let history = loadHistory()
  try {
    const raw = localStorage.getItem(LEGACY_CURRENT_KEY)
    if (raw) {
      const legacy = JSON.parse(raw)
      if (typeof legacy?.id === 'string' && Array.isArray(legacy?.messages)) {
        history = withArchived(history, legacy.id, legacy.messages)
        saveHistory(history)
      }
      localStorage.removeItem(LEGACY_CURRENT_KEY)
    }
  } catch {}
  return history
}

// Main emits nothing for a run once it's cancelled, so Stop settles any tool
// call still awaiting approval (or mid-flight) here instead of leaving its
// approve/reject buttons or spinner on screen.
function settleOpenToolCalls(messages: BridgeChatMessage[]): BridgeChatMessage[] {
  return messages.map((m) =>
    m.toolCalls?.some((tc) => tc.status === 'pending-approval' || tc.status === 'running')
      ? {
          ...m,
          toolCalls: m.toolCalls.map((tc) =>
            tc.status === 'pending-approval' || tc.status === 'running'
              ? { ...tc, status: 'error' as const, result: 'Cancelled.' }
              : tc
          ),
        }
      : m
  )
}

function toWireMessages(messages: BridgeChatMessage[]): BridgeMessage[] {
  return messages.map((m) => ({ role: m.role, content: m.content }))
}

function ensureAssistantMessage(messages: BridgeChatMessage[]): BridgeChatMessage[] {
  const last = messages[messages.length - 1]
  if (last && last.role === 'assistant') return messages
  return [...messages, { role: 'assistant', content: '' }]
}

function dropTrailingEmptyAssistant(messages: BridgeChatMessage[]): BridgeChatMessage[] {
  const last = messages[messages.length - 1]
  if (last && last.role === 'assistant' && !last.content && !last.toolCalls?.length) {
    return messages.slice(0, -1)
  }
  return messages
}

interface BridgeStore {
  conversations: Record<string, BridgeConversation>
  history: StoredSession[]
  openConversation: (sessionId: string, agentMode: boolean) => void
  closeConversation: (sessionId: string) => void
  clearConversation: (sessionId: string) => void
  restorePrevious: (sessionId: string) => boolean
  sendMessage: (sessionId: string, cwd: string, text: string, override?: ConnectionOverride) => void
  regenerate: (sessionId: string, cwd: string, messageIndex: number, override?: ConnectionOverride) => void
  toggleAgentMode: (sessionId: string) => void
  approveToolCall: (sessionId: string, toolCallId: string) => void
  rejectToolCall: (sessionId: string, toolCallId: string) => void
  cancel: (sessionId: string) => void
  setDraftInput: (sessionId: string, text: string) => void
  appendDraftInput: (sessionId: string, text: string) => void
  initEventListener: () => () => void
}

export const useBridgeStore = create<BridgeStore>((set, get) => {
  const patch = (sessionId: string, fn: (c: BridgeConversation) => Partial<BridgeConversation>) => {
    const current = get().conversations[sessionId]
    if (!current) return
    set({ conversations: { ...get().conversations, [sessionId]: { ...current, ...fn(current) } } })
  }

  // Archives a transcript into history. Always starts from a fresh
  // localStorage read, not get().history: another window may have archived
  // sessions since this store loaded, and starting from the snapshot would
  // erase them on save.
  const archive = (historyId: string, messages: BridgeChatMessage[]) => {
    const history = withArchived(loadHistory(), historyId, messages)
    saveHistory(history)
    set({ history })
  }

  const startTurn = (sessionId: string, cwd: string, wire: BridgeChatMessage[], override?: ConnectionOverride) => {
    const conv = get().conversations[sessionId]
    if (!conv) return
    patch(sessionId, () => ({ messages: [...wire, { role: 'assistant', content: '' }], streaming: true }))
    const s = override ?? useBridgeSettingsStore.getState()
    window.api.bridgeSend(cwd, toWireMessages(wire), conv.agentMode, {
      endpoint: s.endpoint,
      apiKey: s.apiKey,
      modelId: s.modelId,
      sessionId: conv.historyId,
    }, sessionId)
  }

  return {
    conversations: {},
    history: migrateLegacyCurrent(),

    openConversation: (sessionId, agentMode) => {
      if (get().conversations[sessionId]) return
      const saved = loadPersisted(sessionId)
      set({
        conversations: {
          ...get().conversations,
          [sessionId]: {
            messages: saved?.messages ?? [],
            historyId: saved?.historyId ?? newHistoryId(),
            agentMode,
            streaming: false,
            draftInput: '',
          },
        },
      })
    },

    closeConversation: (sessionId) => {
      const conv = get().conversations[sessionId]
      if (!conv) return
      if (conv.streaming) window.api.bridgeCancel(sessionId)
      archive(conv.historyId, dropTrailingEmptyAssistant(conv.messages))
      forgetPersisted(sessionId)
      const { [sessionId]: _closed, ...rest } = get().conversations
      set({ conversations: rest })
    },

    clearConversation: (sessionId) => {
      const conv = get().conversations[sessionId]
      if (!conv) return
      if (conv.streaming) window.api.bridgeCancel(sessionId)
      archive(conv.historyId, dropTrailingEmptyAssistant(conv.messages))
      patch(sessionId, () => ({ messages: [], historyId: newHistoryId(), streaming: false }))
      persist(sessionId, get().conversations[sessionId])
    },

    restorePrevious: (sessionId) => {
      const conv = get().conversations[sessionId]
      if (!conv || conv.streaming) return false
      const previous = loadHistory().find((s) => s.id !== conv.historyId)
      if (!previous) return false
      archive(conv.historyId, conv.messages)
      patch(sessionId, () => ({ messages: previous.messages, historyId: previous.id }))
      persist(sessionId, get().conversations[sessionId])
      return true
    },

    sendMessage: (sessionId, cwd, text, override) => {
      const conv = get().conversations[sessionId]
      if (!conv) return
      startTurn(sessionId, cwd, [...conv.messages, { role: 'user', content: text }], override)
    },

    regenerate: (sessionId, cwd, messageIndex, override) => {
      const conv = get().conversations[sessionId]
      const target = conv?.messages[messageIndex]
      if (!conv || !target || target.role !== 'user') return
      startTurn(sessionId, cwd, [...conv.messages.slice(0, messageIndex), { role: 'user', content: target.content }], override)
    },

    toggleAgentMode: (sessionId) => patch(sessionId, (c) => ({ agentMode: !c.agentMode })),

    approveToolCall: (sessionId, toolCallId) => window.api.bridgeApprove(toolCallId, sessionId),
    rejectToolCall: (sessionId, toolCallId) => window.api.bridgeReject(toolCallId, sessionId),

    cancel: (sessionId) => {
      window.api.bridgeCancel(sessionId)
      patch(sessionId, (c) => ({ messages: settleOpenToolCalls(dropTrailingEmptyAssistant(c.messages)), streaming: false }))
    },

    setDraftInput: (sessionId, text) => patch(sessionId, () => ({ draftInput: text })),
    appendDraftInput: (sessionId, text) =>
      patch(sessionId, (c) => ({ draftInput: c.draftInput ? `${c.draftInput}\n${text}` : text })),

    initEventListener: () =>
      window.api.onBridgeEvent((event: BridgeSessionEvent) => {
        const sessionId = event.sessionId
        // A late event for a session that was closed (or one with no id at
        // all) has nowhere to go — drop it rather than resurrect anything.
        if (!sessionId || !get().conversations[sessionId]) return
        handleEvent(sessionId, event, patch, get)
      }),
  }
})

function handleEvent(
  sessionId: string,
  event: BridgeSessionEvent,
  patch: (sessionId: string, fn: (c: BridgeConversation) => Partial<BridgeConversation>) => void,
  get: () => BridgeStore,
): void {
  const updateLast = (fn: (last: BridgeChatMessage) => BridgeChatMessage) =>
    patch(sessionId, (c) => {
      const messages = ensureAssistantMessage(c.messages)
      return { messages: [...messages.slice(0, -1), fn({ ...messages[messages.length - 1] })] }
    })

  switch (event.type) {
    case 'new-turn':
      patch(sessionId, (c) => {
        const tail = c.messages[c.messages.length - 1]
        // Don't push if there's already an empty assistant placeholder
        if (tail?.role === 'assistant' && !tail.content && !tail.toolCalls?.length) return {}
        return { messages: [...c.messages, { role: 'assistant', content: '' }] }
      })
      return
    case 'text-delta':
      updateLast((last) => ({ ...last, content: last.content + event.delta }))
      return
    case 'content-replace':
      updateLast((last) => ({ ...last, content: event.content }))
      return
    case 'tool-call':
      updateLast((last) => ({
        ...last,
        toolCalls: [...(last.toolCalls ?? []), { id: event.id, name: event.name, args: event.args, status: 'running' }],
      }))
      return
    case 'need-approval':
      updateLast((last) => ({
        ...last,
        toolCalls: (last.toolCalls ?? []).map((tc) => (tc.id === event.id ? { ...tc, status: 'pending-approval' as const } : tc)),
      }))
      return
    case 'tool-result':
      updateLast((last) => ({
        ...last,
        toolCalls: (last.toolCalls ?? []).map((tc) =>
          tc.id === event.id ? { ...tc, status: event.isError ? ('error' as const) : ('done' as const), result: event.result } : tc
        ),
      }))
      return
    case 'done':
      // If the model returned nothing, drop the empty placeholder so it doesn't
      // linger in the transcript as a ghost bubble.
      patch(sessionId, (c) => ({ messages: dropTrailingEmptyAssistant(c.messages), streaming: false }))
      persist(sessionId, get().conversations[sessionId])
      return
    case 'error':
      updateLast((last) => ({ ...last, content: `${last.content}\n\n**Error:** ${event.message}` }))
      patch(sessionId, () => ({ streaming: false }))
      return
  }
}
