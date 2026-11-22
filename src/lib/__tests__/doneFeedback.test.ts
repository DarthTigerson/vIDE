import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.hoisted(() => {
  const store: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
  }
})

vi.mock('@/stores/doneFeedbackStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/stores/doneFeedbackStore')>()),
  playDoneSound: vi.fn(),
  speak: vi.fn(),
}))

import { handleTurnDone } from '../doneFeedback'
import { playDoneSound, speak, useDoneFeedbackStore } from '@/stores/doneFeedbackStore'
import type { AgentSession } from '@/stores/claudeStore'

const instances = [
  { id: 'c1', kind: 'claude' },
  { id: 'r1', kind: 'rocky' },
  { id: 'b1', kind: 'bridge' },
] as unknown as AgentSession[]

beforeEach(() => {
  vi.mocked(playDoneSound).mockReset()
  vi.mocked(speak).mockReset().mockResolvedValue(true)
  useDoneFeedbackStore.setState({
    mode: 'speak', agents: { claude: true, rocky: true }, soundId: 'beep', voiceId: 'ryan', readAloud: 'first', speed: 1.2,
  })
})

describe('handleTurnDone', () => {
  it('ignores unknown instances and bridge', async () => {
    await handleTurnDone(instances, 'nope', 'x')
    await handleTurnDone(instances, 'b1', 'x')
    expect(speak).not.toHaveBeenCalled()
    expect(playDoneSound).not.toHaveBeenCalled()
  })

  it('does nothing when mode is off', async () => {
    useDoneFeedbackStore.setState({ mode: 'off' })
    await handleTurnDone(instances, 'c1', 'x')
    expect(speak).not.toHaveBeenCalled()
    expect(playDoneSound).not.toHaveBeenCalled()
  })

  it('does nothing when the agent is switched off', async () => {
    useDoneFeedbackStore.setState({ agents: { claude: false, rocky: true } })
    await handleTurnDone(instances, 'c1', 'x')
    expect(speak).not.toHaveBeenCalled()
    expect(playDoneSound).not.toHaveBeenCalled()
  })

  it('plays the sound in sound mode', async () => {
    useDoneFeedbackStore.setState({ mode: 'sound' })
    await handleTurnDone(instances, 'c1', 'Hello.')
    expect(playDoneSound).toHaveBeenCalledWith('beep')
    expect(speak).not.toHaveBeenCalled()
  })

  it('speaks the first sentence in speak mode', async () => {
    await handleTurnDone(instances, 'c1', 'All done. More detail here.')
    expect(speak).toHaveBeenCalledWith('All done.', 'ryan', 1.2)
    expect(playDoneSound).not.toHaveBeenCalled()
  })

  it('falls back to the sound when speak resolves false', async () => {
    vi.mocked(speak).mockResolvedValue(false)
    await handleTurnDone(instances, 'c1', 'Hi.')
    expect(playDoneSound).toHaveBeenCalledWith('beep')
  })

  it('falls back to the sound when speak rejects', async () => {
    vi.mocked(speak).mockRejectedValue(new Error('boom'))
    await handleTurnDone(instances, 'c1', 'Hi.')
    expect(playDoneSound).toHaveBeenCalledWith('beep')
  })

  it('uses the Rocky name for an empty reply', async () => {
    await handleTurnDone(instances, 'r1', '')
    expect(speak).toHaveBeenCalledWith('Rocky finished.', 'ryan', 1.2)
  })
})
