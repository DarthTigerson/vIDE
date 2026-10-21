import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import { useBridgeStore, type BridgeToolCallBlock, type BridgeChatMessage } from '@/stores/bridgeStore'
import { useClaudeStore } from '@/stores/claudeStore'
import { useBridgeAgentModeShortcut } from './useBridgeAgentModeShortcut'
import { changedPaths, describeTool, editDiff, formatDuration, type ToolIcon } from './bridgeToolView'

// Activity rail: each assistant turn is a column of steps (reasoning, tool
// calls, commentary) joined by a line, with the final answer below it.

type Tone = 'accent' | 'muted' | 'ok' | 'warn' | 'err'

const mix = (cssVar: string) => ({
  background: `color-mix(in srgb, var(${cssVar}) 16%, transparent)`,
  color: `var(${cssVar})`,
})

// Status colours reuse the Git change colours so they follow light/dark
// themes and the user's Settings > Git colour choice.
const TONE: Record<Tone, CSSProperties> = {
  accent: { background: 'rgb(var(--color-accent) / 0.16)', color: 'rgb(var(--color-accent))' },
  muted: { background: 'var(--color-panel)', border: '1px solid var(--color-border)', color: 'var(--color-fg-muted)' },
  ok: mix('--git-added'),
  warn: mix('--git-modified'),
  err: mix('--git-deleted'),
}

function Icon({ name }: { name: ToolIcon | 'spark' | 'dot' | 'x' }) {
  const p = { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (name) {
    case 'spark': return <svg {...p}><path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4z" /></svg>
    case 'read': return <svg {...p}><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /></svg>
    case 'edit': return <svg {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>
    case 'search': return <svg {...p}><circle cx="11" cy="11" r="6" /><path d="m20 20-4-4" /></svg>
    case 'run': return <svg {...p}><path d="m5 17 5-5-5-5" /><path d="M12 19h7" /></svg>
    case 'list': return <svg {...p}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>
    case 'delete': return <svg {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
    case 'move': return <svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    case 'x': return <svg {...p}><path d="M7 7l10 10M17 7 7 17" /></svg>
    case 'dot': return <svg {...p}><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" /></svg>
    default: return <svg {...p}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" /></svg>
  }
}

function Spinner() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8" fill="none" stroke="var(--color-border)" strokeWidth="2.6" />
      <path className="bridge-spin" d="M12 4a8 8 0 0 1 8 8" fill="none" stroke="rgb(var(--color-accent))" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

function Step({ tone, node, pulse, children }: { tone: Tone; node: ReactNode; pulse?: boolean; children: ReactNode }) {
  return (
    <div className="bridge-step">
      <div className={pulse ? 'bridge-node bridge-pulse' : 'bridge-node'} style={TONE[tone]}>{node}</div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function FileChip({ children }: { children: ReactNode }) {
  return (
    <span className="min-w-0 truncate rounded border border-border bg-panel px-1.5 py-px font-mono text-[11px] text-fg">
      {children}
    </span>
  )
}

// Re-renders every 100ms while `active`, for live elapsed times.
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [active])
  return active ? now : Date.now()
}

function ReasoningStep({ message, live }: { message: BridgeChatMessage; live: boolean }) {
  const [open, setOpen] = useState(false)
  const now = useNow(live)
  const text = message.reasoning ?? ''
  const ms = message.reasoningMs ?? (message.reasoningStartedAt ? now - message.reasoningStartedAt : 0)

  if (live) {
    return (
      <Step tone="accent" node={<Icon name="spark" />}>
        <div className="flex min-h-[22px] items-center gap-2 text-xs">
          <span className="bridge-shimmer font-medium">Reasoning</span>
          <span className="ml-auto font-mono text-[10.5px] text-fg-muted">{formatDuration(ms)}</span>
        </div>
        {/* Newest lines stay in view; older ones scroll off the top. */}
        <div className="mt-1 flex max-h-28 flex-col justify-end overflow-hidden text-xs leading-relaxed text-fg-muted [mask-image:linear-gradient(to_bottom,transparent,black_1.5rem)]">
          <p className="whitespace-pre-wrap">{text}<span className="bridge-caret" /></p>
        </div>
      </Step>
    )
  }

  return (
    <Step tone="accent" node={<Icon name="spark" />}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-[22px] w-full items-center gap-2 text-left text-xs"
      >
        <span className="font-medium text-fg">Reasoned</span>
        <span className="text-fg-muted">for {formatDuration(ms)}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className={`text-fg-muted transition-transform ${open ? 'rotate-90' : ''}`}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
      {open ? (
        <div className="mt-1.5 whitespace-pre-wrap rounded-lg border border-border bg-panel px-3 py-2 text-xs leading-relaxed text-fg-muted">{text}</div>
      ) : (
        <div className="truncate text-xs text-fg-muted">{text.trim().split('\n')[0]}</div>
      )}
    </Step>
  )
}

const MAX_PREVIEW_LINES = 12

function DiffCard({ oldString, newString }: { oldString: string; newString: string }) {
  const { lines } = editDiff(oldString, newString)
  const shown = lines.slice(0, MAX_PREVIEW_LINES)
  return (
    <div className="mt-1.5 overflow-hidden rounded-lg border border-border bg-panel py-1 font-mono text-[11px] leading-[18px]">
      {shown.map((l, i) => (
        <div
          key={i}
          className="grid grid-cols-[16px_minmax(0,1fr)] whitespace-pre px-1.5"
          style={{ background: `color-mix(in srgb, var(${l.kind === '+' ? '--git-added' : '--git-deleted'}) 12%, transparent)` }}
        >
          <span style={{ color: `var(${l.kind === '+' ? '--git-added' : '--git-deleted'})` }}>{l.kind === '+' ? '+' : '−'}</span>
          <span className="truncate text-fg">{l.text || ' '}</span>
        </div>
      ))}
      {lines.length > shown.length && (
        <div className="px-1.5 pt-1 text-fg-muted">+{lines.length - shown.length} more lines</div>
      )}
    </div>
  )
}

function TextPreview({ text, tone }: { text: string; tone?: 'err' }) {
  const lines = text.split('\n')
  const shown = lines.slice(0, MAX_PREVIEW_LINES).join('\n')
  return (
    <pre
      className="mt-1.5 overflow-x-auto whitespace-pre rounded-lg border border-border bg-panel px-2.5 py-1.5 font-mono text-[11px] leading-relaxed"
      style={tone === 'err' ? { color: 'var(--git-deleted)' } : { color: 'var(--color-fg)' }}
    >
      {shown}
      {lines.length > MAX_PREVIEW_LINES ? `\n… ${lines.length - MAX_PREVIEW_LINES} more lines` : ''}
    </pre>
  )
}

// What the user is approving: the command, the diff, or the file content.
function ApprovalPreview({ block }: { block: BridgeToolCallBlock }) {
  const a = block.args
  if (block.name === 'run_command' && typeof a.command === 'string') {
    return <TextPreview text={`$ ${a.command}`} />
  }
  if (block.name === 'edit_file' && typeof a.old_string === 'string' && typeof a.new_string === 'string') {
    return <DiffCard oldString={a.old_string} newString={a.new_string} />
  }
  if (typeof a.content === 'string') return <TextPreview text={a.content} />
  return <TextPreview text={JSON.stringify(a, null, 2)} />
}

function ToolStep({ sessionId, block, cwd }: { sessionId: string; block: BridgeToolCallBlock; cwd: string }) {
  const [open, setOpen] = useState(false)
  const approveToolCall = useBridgeStore((s) => s.approveToolCall)
  const rejectToolCall = useBridgeStore((s) => s.rejectToolCall)
  const view = describeTool(block, cwd)
  const a = block.args
  const isEdit = block.name === 'edit_file' && typeof a.old_string === 'string' && typeof a.new_string === 'string'
  const diff = isEdit ? editDiff(a.old_string as string, a.new_string as string) : null

  const pending = block.status === 'pending-approval'
  const running = block.status === 'running'
  const failed = block.status === 'error'
  const tone: Tone = pending ? 'warn' : failed ? 'err' : running ? 'muted' : view.icon === 'edit' ? 'ok' : 'muted'
  const node = running ? <Spinner /> : failed ? <Icon name="x" /> : <Icon name={view.icon} />

  const meta = pending
    ? 'needs approval'
    : failed
      ? 'failed'
      : diff && block.status === 'done'
        ? null
        : block.durationMs !== undefined
          ? formatDuration(block.durationMs)
          : null

  return (
    <Step tone={tone} node={node} pulse={pending}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-[22px] w-full min-w-0 items-center gap-2 text-left text-xs"
        title={pending ? undefined : 'Show arguments and result'}
      >
        <span className="shrink-0 font-medium" style={pending ? { color: 'var(--git-modified)' } : running ? { color: 'rgb(var(--color-accent))' } : undefined}>
          {pending ? `Wants to ${view.ask}` : running ? view.activeVerb : view.verb}
        </span>
        {view.target && (
          <FileChip>
            {view.target}
            {view.range && <span className="text-fg-muted">{view.range}</span>}
          </FileChip>
        )}
        {diff && block.status === 'done' && (
          <span className="ml-auto shrink-0 font-mono text-[10.5px]">
            <span style={{ color: 'var(--git-added)' }}>+{diff.added}</span>{' '}
            <span style={{ color: 'var(--git-deleted)' }}>−{diff.removed}</span>
          </span>
        )}
        {meta && (
          <span className="ml-auto shrink-0 font-mono text-[10.5px]" style={failed ? { color: 'var(--git-deleted)' } : pending ? { color: 'var(--git-modified)' } : { color: 'var(--color-fg-muted)' }}>
            {meta}
          </span>
        )}
      </button>

      {pending && (
        <>
          <ApprovalPreview block={block} />
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => approveToolCall(sessionId, block.id)}
              className="h-7 rounded-md px-3 text-xs font-semibold text-bg"
              style={{ background: 'var(--git-modified)' }}
            >
              Allow
            </button>
            <button
              type="button"
              onClick={() => rejectToolCall(sessionId, block.id)}
              className="h-7 rounded-md border border-border px-3 text-xs text-fg-muted hover:text-fg"
            >
              Deny
            </button>
          </div>
        </>
      )}

      {!pending && !open && isEdit && block.status === 'done' && (
        <DiffCard oldString={a.old_string as string} newString={a.new_string as string} />
      )}
      {!pending && !open && failed && block.result && <TextPreview text={block.result} tone="err" />}

      {!pending && open && (
        <pre className="mt-1.5 overflow-x-auto whitespace-pre rounded-lg border border-border bg-panel px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-fg-muted">
          {JSON.stringify(block.args, null, 2)}
          {block.result != null ? `\n\n${block.result.length > 3000 ? block.result.slice(0, 3000) + '\n… [truncated]' : block.result}` : ''}
        </pre>
      )}
    </Step>
  )
}

function WorkingStep() {
  return (
    <div role="status" aria-label="Bridge is thinking">
      <Step tone="accent" node={<Icon name="spark" />}>
        <div className="flex min-h-[22px] items-center text-xs">
          <span className="bridge-shimmer font-medium">Thinking</span>
        </div>
      </Step>
    </div>
  )
}

function RegenerateIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  )
}

function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ) : (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [text])
  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-fg-muted opacity-50 hover:opacity-100 hover:text-fg transition-opacity"
      title="Copy"
    >
      <CopyIcon copied={copied} />
    </button>
  )
}

const EMPTY: BridgeChatMessage[] = []

// Where vIDE Compacting cut the transcript: everything above stays readable
// but is no longer sent; the model continues from this summary.
function CompactionDivider({ summary }: { summary: string }) {
  return (
    <details className="self-stretch text-xs text-fg-muted">
      <summary className="flex cursor-pointer list-none items-center gap-2 select-none hover:text-fg">
        <span className="h-px flex-1 bg-border" />
        Context compacted — show summary
        <span className="h-px flex-1 bg-border" />
      </summary>
      <div className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-fg">
        <ReactMarkdown>{summary}</ReactMarkdown>
      </div>
    </details>
  )
}

// One assistant turn: the rounds between two user messages.
function Turn({ sessionId, cwd, rounds, live }: { sessionId: string; cwd: string; rounds: BridgeChatMessage[]; live: boolean }) {
  const last = rounds[rounds.length - 1]
  const steps: ReactNode[] = []
  rounds.forEach((m, ri) => {
    const isLast = ri === rounds.length - 1
    if (m.reasoning) {
      steps.push(<ReasoningStep key={`r${ri}`} message={m} live={live && isLast && m.reasoningMs === undefined} />)
    }
    // Text written alongside tool calls is commentary on the rail; the last
    // round's text with no tool calls is the answer, shown below.
    if (m.content && (m.toolCalls?.length || !isLast)) {
      steps.push(
        <Step key={`c${ri}`} tone="muted" node={<Icon name="dot" />}>
          <div className="text-xs leading-relaxed text-fg-muted [&_p]:my-0.5"><ReactMarkdown>{m.content}</ReactMarkdown></div>
        </Step>
      )
    }
    for (const tc of m.toolCalls ?? []) steps.push(<ToolStep key={tc.id} sessionId={sessionId} block={tc} cwd={cwd} />)
  })
  if (live && !last.reasoning && !last.content && !last.toolCalls?.length) steps.push(<WorkingStep key="working" />)

  const answer = last.content && !last.toolCalls?.length ? last.content : null
  const tools = rounds.flatMap((m) => m.toolCalls ?? [])
  const files = new Set(tools.flatMap(changedPaths)).size
  const started = rounds[0].startedAt
  const worked = !live && started !== undefined && last.endedAt !== undefined ? last.endedAt - started : null

  return (
    <div className="flex flex-col gap-2.5 self-stretch">
      {steps.length > 0 && <div className="flex flex-col">{steps}</div>}
      {answer && (
        <div>
          <div className="text-sm leading-relaxed text-fg"><ReactMarkdown>{answer}</ReactMarkdown></div>
          <div className="mt-1 flex justify-start"><CopyButton text={answer} /></div>
        </div>
      )}
      {!live && tools.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-fg-muted">
          {worked !== null && <><span>Worked {formatDuration(worked)}</span><span>·</span></>}
          <span>{tools.length} {tools.length === 1 ? 'tool' : 'tools'}</span>
          {files > 0 && <><span>·</span><span>{files} {files === 1 ? 'file' : 'files'} changed</span></>}
        </div>
      )}
    </div>
  )
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n)
}

function ContextMeter({ usage }: { usage: { usedTokens: number; contextWindow: number | null } }) {
  const { usedTokens, contextWindow } = usage
  const pct = contextWindow ? Math.min(100, Math.round((usedTokens / contextWindow) * 100)) : null
  const r = 7
  const circ = 2 * Math.PI * r
  return (
    <span
      className="flex items-center gap-1.5 font-mono text-[10.5px] text-fg-muted tabular-nums"
      title={`Context used by the last request${pct !== null ? ` (${pct}%)` : ''}; vIDE compacts at 80%`}
    >
      {pct !== null && (
        <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
          <circle cx="9" cy="9" r={r} fill="none" stroke="var(--color-border)" strokeWidth="2.5" />
          <circle
            cx="9" cy="9" r={r} fill="none" strokeWidth="2.5" strokeLinecap="round"
            stroke={pct >= 70 ? 'var(--git-modified)' : 'rgb(var(--color-accent))'}
            strokeDasharray={`${(pct / 100) * circ} ${circ}`}
            transform="rotate(-90 9 9)"
          />
        </svg>
      )}
      {formatTokens(usedTokens)}{contextWindow ? ` / ${formatTokens(contextWindow)}` : ' tokens'}
    </span>
  )
}

type Item =
  | { kind: 'compaction'; index: number; summary: string }
  | { kind: 'user'; index: number; message: BridgeChatMessage }
  | { kind: 'turn'; index: number; rounds: BridgeChatMessage[] }

function groupItems(messages: BridgeChatMessage[]): Item[] {
  const items: Item[] = []
  messages.forEach((m, i) => {
    if (m.compaction) items.push({ kind: 'compaction', index: i, summary: m.compaction.summary })
    else if (m.role === 'user') items.push({ kind: 'user', index: i, message: m })
    else {
      const prev = items[items.length - 1]
      if (prev?.kind === 'turn') prev.rounds.push(m)
      else items.push({ kind: 'turn', index: i, rounds: [m] })
    }
  })
  return items
}

export function BridgeChat({ sessionId, cwd, label, connectionOverride, beforeSend }: {
  sessionId: string
  cwd: string
  label: string
  connectionOverride?: { endpoint: string; apiKey: string; modelId: string; toolCallLimit?: number }
  beforeSend?: () => Promise<void>
}) {
  useBridgeAgentModeShortcut(sessionId)
  const messages = useBridgeStore((s) => s.conversations[sessionId]?.messages ?? EMPTY)
  const agentMode = useBridgeStore((s) => s.conversations[sessionId]?.agentMode ?? false)
  const streaming = useBridgeStore((s) => s.conversations[sessionId]?.streaming ?? false)
  const input = useBridgeStore((s) => s.conversations[sessionId]?.draftInput ?? '')
  const compacting = useBridgeStore((s) => s.conversations[sessionId]?.compacting ?? false)
  const contextUsage = useBridgeStore((s) => s.conversations[sessionId]?.contextUsage)
  const { sendMessage, regenerate, toggleAgentMode, cancel, setDraftInput, appendDraftInput } = useBridgeStore.getState()
  const setInput = (text: string) => setDraftInput(sessionId, text)
  const focusToken = useClaudeStore((s) => s.focusToken)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const seenFocusTokenRef = useRef(focusToken)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages])

  useEffect(() => {
    const tokenChangedSinceMount = focusToken !== seenFocusTokenRef.current
    seenFocusTokenRef.current = focusToken
    const injection = useClaudeStore.getState().pendingInjection
    // A real pendingInjection is always fresh: consumeInjection() nulls it out immediately
    // after use, so a stale remount (old focusToken, already-consumed injection) never has
    // one — only a genuine not-yet-consumed Cmd+L send does, even at first mount.
    if (injection) {
      appendDraftInput(sessionId, injection)
      useClaudeStore.getState().consumeInjection()
      textareaRef.current?.focus()
      return
    }
    // No injection to consume: only steal focus if focusToken changed while THIS instance
    // was mounted (a live "just focus the chat" call). A token that was already elevated at
    // mount time (e.g. from an earlier Cmd+L press on a previous mount) must not re-trigger.
    if (tokenChangedSinceMount) {
      textareaRef.current?.focus()
    }
  }, [focusToken, sessionId])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || streaming || starting) return
    if (beforeSend) {
      setStarting(true)
      try { await beforeSend() } finally { setStarting(false) }
    }
    sendMessage(sessionId, cwd, input, connectionOverride)
    setInput('')
  }

  const items = groupItems(messages)
  const segment = (on: boolean) =>
    `flex h-6 items-center gap-1 rounded-[5px] px-2.5 text-xs font-medium transition-colors ${on ? 'bg-accent/20 text-fg' : 'text-fg-muted hover:text-fg'}`

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
        {items.map((item, n) => {
          if (item.kind === 'compaction') return <CompactionDivider key={item.index} summary={item.summary} />
          if (item.kind === 'turn') {
            return (
              <Turn
                key={item.index}
                sessionId={sessionId}
                cwd={cwd}
                rounds={item.rounds}
                live={streaming && n === items.length - 1}
              />
            )
          }
          const m = item.message
          return (
            <div key={item.index} className="self-end max-w-[85%]">
              <div className="rounded-[14px] rounded-br-[4px] border border-border bg-accent/10 px-3 py-2 text-sm text-fg">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
              <div className="mt-1 flex justify-end gap-0.5">
                <CopyButton text={m.content} />
                <button
                  type="button"
                  disabled={streaming}
                  onClick={() => regenerate(sessionId, cwd, item.index, connectionOverride)}
                  className="flex items-center gap-1 rounded px-1 py-0.5 text-xs text-fg-muted opacity-50 hover:opacity-100 hover:text-fg disabled:pointer-events-none transition-opacity"
                  title="Regenerate response"
                >
                  <RegenerateIcon />
                </button>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSubmit} className="p-2.5">
        <div className="rounded-xl border border-border bg-panel focus-within:border-accent/60">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSubmit(e)
              }
            }}
            placeholder={`Message ${label}…`}
            rows={2}
            disabled={starting}
            className="block w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-sm text-fg outline-none disabled:opacity-50"
          />
          <div className="flex items-center gap-2 px-2 pb-2 pt-1">
            <div role="group" aria-label="Tool approval" className="flex rounded-md border border-border bg-bg p-0.5">
              <button
                type="button"
                aria-pressed={!agentMode}
                onClick={() => agentMode && toggleAgentMode(sessionId)}
                className={segment(!agentMode)}
                title="Ask before each tool runs"
              >
                Ask
              </button>
              <button
                type="button"
                aria-pressed={agentMode}
                onClick={() => !agentMode && toggleAgentMode(sessionId)}
                className={segment(agentMode)}
                title="Run tools without asking"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
                </svg>
                Agent
              </button>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {compacting && <span className="text-xs text-fg-muted animate-pulse">Compacting context…</span>}
              {!compacting && contextUsage && <ContextMeter usage={contextUsage} />}
              {starting && <span className="text-xs text-fg-muted animate-pulse">Starting server…</span>}
              {!starting && streaming ? (
                <button
                  type="button"
                  onClick={() => cancel(sessionId)}
                  aria-label="Stop"
                  title="Stop"
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-fg"
                >
                  <span className="h-2.5 w-2.5 rounded-[2px] bg-bg" />
                </button>
              ) : (
                <button
                  type="submit"
                  aria-label="Send"
                  title="Send"
                  disabled={!input.trim() || starting}
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-on-accent disabled:opacity-30"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
