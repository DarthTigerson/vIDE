import { create } from 'zustand'
import { useBridgeSettingsStore } from './bridgeSettingsStore'
import { useTodoMcpStore } from './todoMcpStore'
import { useNotesMcpStore } from './notesMcpStore'
import { useScriptsMcpStore } from './scriptsMcpStore'
import { useBrowserMcpStore } from './browserMcpStore'
import type { BridgeCompactResult, BridgeMessage, BridgeSessionEvent, BridgeSettings, VideToolGroup } from '@/types/api'
import type { ReasoningEffort } from './llamaModelsStore'

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
  startedAt?: number
  durationMs?: number
}

export interface BridgeChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: BridgeToolCallBlock[]
  // vIDE Compacting marker: `content` is the summary as the user message the
  // model sees (what the transcript is sent from), `summary` the text shown
  // in the divider. Everything before the latest marker stays on screen but
  // is no longer sent.
  compaction?: { summary: string }
  // The model's reasoning for this round. Shown in the chat, never sent back.
  reasoning?: string
  reasoningStartedAt?: number
  // Set once text or a tool call follows the reasoning (or the round ends).
  reasoningMs?: number
  // When this assistant round started and finished, for "Worked 14s".
  startedAt?: number
  endedAt?: number
  // Effort changed while this round ran; the next round uses `to`.
  effortChange?: { from: ReasoningEffort; to: ReasoningEffort }
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
  // A compaction summary is being written.
  compacting?: boolean
  // Tokens the last request used, against the model's context when known.
  contextUsage?: { usedTokens: number; contextWindow: number | null; tokensPerSecond?: number }
  // This session's reasoning effort, sent per request. Missing = the model's
  // launch setting (Settings > Llama), which the server already applies.
  reasoningEffort?: ReasoningEffort
}

type ConnectionOverride = { endpoint: string; apiKey: string; modelId: string; toolCallLimit?: number; reasoningEffort?: ReasoningEffort }

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

// Bridge/llama get the same vIDE tools Claude does, gated by the same
// per-feature MCP toggles (web search is always on main-side).
function enabledVideTools(): VideToolGroup[] {
  const groups: VideToolGroup[] = []
  if (useTodoMcpStore.getState().enabled) groups.push('todos')
  if (useNotesMcpStore.getState().enabled) groups.push('notes')
  if (useScriptsMcpStore.getState().enabled) groups.push('scripts')
  if (useBrowserMcpStore.getState().enabled) groups.push('browser')
  return groups
}

// What the model is sent: from the latest compaction marker on (as its
// summary user message). A user message right after it is merged into it, so
// templates that require strictly alternating roles still accept it.
function toWireMessages(messages: BridgeChatMessage[]): BridgeMessage[] {
  let start = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].compaction) { start = i; break }
  }
  const wire: BridgeMessage[] = []
  for (const m of messages.slice(start)) {
    const prev = wire[wire.length - 1]
    if (prev && prev.role === 'user' && m.role === 'user') prev.content = `${prev.content}\n\n${m.content}`
    else wire.push({ role: m.role, content: m.content })
  }
  return wire
}

function ensureAssistantMessage(messages: BridgeChatMessage[]): BridgeChatMessage[] {
  const last = messages[messages.length - 1]
  if (last && last.role === 'assistant') return messages
  return [...messages, { role: 'assistant', content: '', startedAt: Date.now() }]
}

function isEmptyAssistant(m: BridgeChatMessage | undefined): boolean {
  return m?.role === 'assistant' && !m.content && !m.toolCalls?.length && !m.reasoning
}

// Closes a round: stamps endedAt, and the reasoning time if nothing followed it.
function endRound(m: BridgeChatMessage, now = Date.now()): BridgeChatMessage {
  if (m.role !== 'assistant' || m.endedAt) return m
  const reasoningMs = m.reasoningMs ?? (m.reasoningStartedAt ? now - m.reasoningStartedAt : undefined)
  return { ...m, endedAt: now, reasoningMs }
}

// Text or a tool call ends the reasoning phase.
function endReasoning(m: BridgeChatMessage): BridgeChatMessage {
  if (m.reasoningStartedAt === undefined || m.reasoningMs !== undefined) return m
  return { ...m, reasoningMs: Date.now() - m.reasoningStartedAt }
}

function dropTrailingEmptyAssistant(messages: BridgeChatMessage[]): BridgeChatMessage[] {
  const last = messages[messages.length - 1]
  if (isEmptyAssistant(last)) return messages.slice(0, -1)
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
  // Manual vIDE Compacting between turns (the activity-bar Compact button).
  compact: (sessionId: string, override?: ConnectionOverride, focus?: string) => Promise<void>
  regenerate: (sessionId: string, cwd: string, messageIndex: number, override?: ConnectionOverride) => void
  toggleAgentMode: (sessionId: string) => void
  // `current` is the effort shown before the change (the session's, else the model's).
  setReasoningEffort: (sessionId: string, effort: ReasoningEffort, current: ReasoningEffort) => void
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

  const wireSettings = (conv: BridgeConversation, override?: ConnectionOverride): BridgeSettings => {
    const s = override ?? useBridgeSettingsStore.getState()
    return {
      endpoint: s.endpoint,
      apiKey: s.apiKey,
      modelId: s.modelId,
      sessionId: conv.historyId,
      toolCallLimit: s.toolCallLimit,
      videTools: enabledVideTools(),
      // Only llama sessions pass a connection override.
      agentKind: override ? 'llama' : 'bridge',
      reasoningEffort: conv.reasoningEffort,
    }
  }

  const startTurn = (sessionId: string, cwd: string, wire: BridgeChatMessage[], override?: ConnectionOverride) => {
    const conv = get().conversations[sessionId]
    if (!conv) return
    patch(sessionId, () => ({ messages: [...wire, { role: 'assistant', content: '', startedAt: Date.now() }], streaming: true }))
    window.api.bridgeSend(cwd, toWireMessages(wire), conv.agentMode, wireSettings(conv, override), sessionId)
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

    compact: async (sessionId, override, focus) => {
      const conv = get().conversations[sessionId]
      if (!conv || conv.streaming || conv.compacting || conv.messages.length === 0) return
      patch(sessionId, () => ({ compacting: true }))
      let result: BridgeCompactResult
      try {
        result = await window.api.bridgeCompact({ messages: toWireMessages(conv.messages), settings: wireSettings(conv, override), focus })
      } catch (err) {
        result = { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
      if (!get().conversations[sessionId]) return
      patch(sessionId, (c) => ({
        compacting: false,
        messages: result.ok
          ? [...c.messages, { role: 'user', content: result.content, compaction: { summary: result.summary } }]
          : [...c.messages, { role: 'assistant', content: `**Compaction failed:** ${result.error}` }],
        ...(result.ok ? { contextUsage: undefined } : {}),
      }))
      persist(sessionId, get().conversations[sessionId])
    },

    toggleAgentMode: (sessionId) => patch(sessionId, (c) => ({ agentMode: !c.agentMode })),

    setReasoningEffort: (sessionId, effort, current) => {
      const conv = get().conversations[sessionId]
      if (!conv) return
      const last = conv.messages[conv.messages.length - 1]
      if (!conv.streaming || last?.role !== 'assistant') {
        patch(sessionId, () => ({ reasoningEffort: effort }))
        return
      }
      // Mid-turn: the running round keeps its effort, so mark it on that
      // round for the rail. Several changes in one round collapse to one.
      const from = last.effortChange?.from ?? current
      const effortChange = from === effort ? undefined : { from, to: effort }
      patch(sessionId, (c) => ({
        reasoningEffort: effort,
        messages: [...c.messages.slice(0, -1), { ...c.messages[c.messages.length - 1], effortChange }],
      }))
      window.api.bridgeSetReasoningEffort(effort, sessionId)
    },

    approveToolCall: (sessionId, toolCallId) => window.api.bridgeApprove(toolCallId, sessionId),
    rejectToolCall: (sessionId, toolCallId) => window.api.bridgeReject(toolCallId, sessionId),

    cancel: (sessionId) => {
      window.api.bridgeCancel(sessionId)
      patch(sessionId, (c) => ({ messages: settleOpenToolCalls(dropTrailingEmptyAssistant(c.messages)), streaming: false, compacting: false }))
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
        if (isEmptyAssistant(tail)) return {}
        const now = Date.now()
        const closed = tail ? [...c.messages.slice(0, -1), endRound(tail, now)] : c.messages
        return { messages: [...closed, { role: 'assistant', content: '', startedAt: now }] }
      })
      return
    case 'text-delta':
      updateLast((last) => ({ ...endReasoning(last), content: last.content + event.delta }))
      return
    case 'reasoning-delta':
      updateLast((last) => ({
        ...last,
        reasoning: (last.reasoning ?? '') + event.delta,
        reasoningStartedAt: last.reasoningStartedAt ?? Date.now(),
      }))
      return
    case 'content-replace':
      updateLast((last) => ({ ...last, content: event.content }))
      return
    case 'tool-call':
      updateLast((last) => ({
        ...endReasoning(last),
        toolCalls: [...(last.toolCalls ?? []), { id: event.id, name: event.name, args: event.args, status: 'running', startedAt: Date.now() }],
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
          tc.id === event.id
            ? {
                ...tc,
                status: event.isError ? ('error' as const) : ('done' as const),
                result: event.result,
                durationMs: tc.startedAt ? Date.now() - tc.startedAt : undefined,
              }
            : tc
        ),
      }))
      return
    case 'compacting':
      patch(sessionId, () => ({ compacting: true }))
      return
    case 'compacted':
      // Mid-turn: the summary covers everything before the in-flight
      // assistant message, so the marker goes just ahead of it.
      patch(sessionId, (c) => {
        const marker: BridgeChatMessage = { role: 'user', content: event.content, compaction: { summary: event.summary } }
        const last = c.messages[c.messages.length - 1]
        const messages = last?.role === 'assistant'
          ? [...c.messages.slice(0, -1), marker, last]
          : [...c.messages, marker]
        return { messages, compacting: false, contextUsage: undefined }
      })
      return
    case 'usage':
      patch(sessionId, () => ({
        contextUsage: { usedTokens: event.usedTokens, contextWindow: event.contextWindow, tokensPerSecond: event.tokensPerSecond },
      }))
      return
    case 'done':
      // If the model returned nothing, drop the empty placeholder so it doesn't
      // linger in the transcript as a ghost bubble.
      patch(sessionId, (c) => {
        const messages = dropTrailingEmptyAssistant(c.messages)
        const last = messages[messages.length - 1]
        return {
          messages: last ? [...messages.slice(0, -1), endRound(last)] : messages,
          streaming: false,
          compacting: false,
        }
      })
      persist(sessionId, get().conversations[sessionId])
      return
    case 'error':
      updateLast((last) => endRound({ ...last, content: `${last.content}\n\n**Error:** ${event.message}` }))
      patch(sessionId, () => ({ streaming: false, compacting: false }))
      return
  }
}
