import type { AgentSession } from '@/stores/claudeStore'
import { playDoneSound, speak, useDoneFeedbackStore, type DoneAgent } from '@/stores/doneFeedbackStore'
import { speechFor } from './speechText'

function agentFor(kind: string | undefined): DoneAgent | null {
  if (kind === 'claude') return 'claude'
  if (kind === 'rocky') return 'rocky'
  return null
}

// Called on claude:turnDone (the Stop hook): plays the done sound or speaks
// the reply, per Settings › Sound & Voice. Speech that can't run (engine or
// voice not installed) falls back to the done sound rather than silence.
export async function handleTurnDone(instances: AgentSession[], instanceId: string, reply: string): Promise<void> {
  const agent = agentFor(instances.find((inst) => inst.id === instanceId)?.kind)
  if (!agent) return
  const { mode, agents, soundId, voiceId, readAloud, speed } = useDoneFeedbackStore.getState()
  if (mode === 'off' || !agents[agent]) return
  if (mode === 'sound') {
    playDoneSound(soundId)
    return
  }
  const text = speechFor(reply, readAloud, agent === 'rocky' ? 'Rocky' : 'Claude')
  const spoke = await speak(text, voiceId, speed).catch(() => false)
  if (!spoke) playDoneSound(soundId)
}
