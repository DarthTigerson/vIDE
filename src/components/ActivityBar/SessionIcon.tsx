import type { AgentSession } from '@/stores/claudeStore'
import { useBridgeStore } from '@/stores/bridgeStore'
import { useClaudeStore } from '@/stores/claudeStore'
import { isLlamaKind, isTerminalKind } from '@/lib/agentKinds'
import { ClaudeStatusIcon } from './ClaudeStatusIcon'
import { BridgeIcon, LlamaIcon, RockyIcon, TerminalIcon } from './ActivityBar'

// Shape says what kind of agent a session is; the hue tells sessions apart.
// Claude's busy state comes from the PTY (ClaudeStatusIcon); Rocky shares
// that PTY busy state but pulses its own icon (the busy gifs are Claude's
// mascot); Bridge/llama sessions are busy while their conversation is
// streaming.
export function SessionIcon({ session }: { session: AgentSession }) {
  const streaming = useBridgeStore((s) => s.conversations[session.id]?.streaming ?? false)
  const ptyBusy = useClaudeStore((s) => s.busyByInstance[session.id] ?? false)
  if (session.kind === 'claude') return <ClaudeStatusIcon instanceId={session.id} color={session.hue} />
  if (session.kind === 'rocky') {
    return <span className={['flex', ptyBusy ? 'animate-pulse' : ''].join(' ')}><RockyIcon color={session.hue} /></span>
  }
  if (isTerminalKind(session.kind)) return <span className="flex" style={{ color: session.hue }}><TerminalIcon /></span>
  return (
    <span className={['flex', streaming ? 'animate-pulse' : ''].join(' ')} style={{ color: session.hue }}>
      {isLlamaKind(session.kind) ? <LlamaIcon /> : <BridgeIcon color={session.hue} />}
    </span>
  )
}
