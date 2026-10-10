import type { AgentSession } from '@/stores/claudeStore'
import { useBridgeStore } from '@/stores/bridgeStore'
import { isLlamaKind } from '@/lib/agentKinds'
import { ClaudeStatusIcon } from './ClaudeStatusIcon'
import { BridgeIcon, LlamaIcon } from './ActivityBar'

// Shape says what kind of agent a session is; the hue tells sessions apart.
// Claude's busy state comes from the PTY (ClaudeStatusIcon); Bridge/llama
// sessions are busy while their conversation is streaming.
export function SessionIcon({ session }: { session: AgentSession }) {
  const streaming = useBridgeStore((s) => s.conversations[session.id]?.streaming ?? false)
  if (session.kind === 'claude') return <ClaudeStatusIcon instanceId={session.id} color={session.hue} />
  return (
    <span className={['flex', streaming ? 'animate-pulse' : ''].join(' ')} style={{ color: session.hue }}>
      {isLlamaKind(session.kind) ? <LlamaIcon /> : <BridgeIcon color={session.hue} />}
    </span>
  )
}
