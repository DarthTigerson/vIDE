import type { AgentSession } from '@/stores/claudeStore'
import { useBridgeStore } from '@/stores/bridgeStore'
import { isLlamaKind, isTerminalKind } from '@/lib/agentKinds'
import { pickRockyGif } from '@/assets/rockyGifs'
import { ClaudeStatusIcon } from './ClaudeStatusIcon'
import { BridgeIcon, LlamaIcon, RockyIcon, TerminalIcon } from './ActivityBar'

// Shape says what kind of agent a session is; the hue tells sessions apart.
// Claude and Rocky busy state comes from the PTY (ClaudeStatusIcon, each with
// its own working gifs); Bridge/llama sessions are busy while their
// conversation is streaming.
export function SessionIcon({ session }: { session: AgentSession }) {
  const streaming = useBridgeStore((s) => s.conversations[session.id]?.streaming ?? false)
  if (session.kind === 'claude') return <ClaudeStatusIcon instanceId={session.id} color={session.hue} />
  if (session.kind === 'rocky') {
    return (
      <ClaudeStatusIcon
        instanceId={session.id}
        color={session.hue}
        pickGif={pickRockyGif}
        idleIcon={<RockyIcon color={session.hue} />}
      />
    )
  }
  if (isTerminalKind(session.kind)) return <span className="flex" style={{ color: session.hue }}><TerminalIcon /></span>
  return (
    <span className={['flex', streaming ? 'animate-pulse' : ''].join(' ')} style={{ color: session.hue }}>
      {session.rocky ? <RockyIcon color={session.hue} /> : isLlamaKind(session.kind) ? <LlamaIcon /> : <BridgeIcon color={session.hue} />}
    </span>
  )
}
