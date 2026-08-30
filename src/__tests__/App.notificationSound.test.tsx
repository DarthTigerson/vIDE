import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useClaudeStore } from '@/stores/claudeStore'
import { useNotificationSoundSettingsStore } from '@/stores/notificationSoundSettingsStore'
import type { AssistantKind } from '@/types/api'

const playNotificationSound = vi.fn()

vi.mock('@/stores/notificationSoundSettingsStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/notificationSoundSettingsStore')>()
  return { ...actual, playNotificationSound: (...args: unknown[]) => playNotificationSound(...args) }
})

// Reproduced verbatim from the onAssistantBusy handler in App.tsx — importing
// App.tsx itself isn't viable here (it pulls in monaco-editor, which breaks
// at module-load time under jsdom; see App.autoFollow.test.tsx for the same
// constraint on rendering it), so this exercises the exact wiring logic in
// isolation instead.
function handleAssistantBusy(assistant: AssistantKind, busy: boolean, chunkCount: number) {
  const wasBusy = useClaudeStore.getState().busyByAssistant[assistant] ?? false
  useClaudeStore.getState().setBusy(assistant, busy)
  if (assistant === 'claude' && wasBusy && !busy && chunkCount > 1) {
    const { enabled, muted, soundId } = useNotificationSoundSettingsStore.getState()
    if (enabled && !muted) playNotificationSound(soundId)
  }
}

beforeEach(() => {
  playNotificationSound.mockClear()
  useClaudeStore.setState({ busyByAssistant: {} })
  useNotificationSoundSettingsStore.setState({ enabled: true, muted: false, soundId: 'ding' })
})

describe('App — Claude-done notification sound wiring', () => {
  it('plays the configured sound when a multi-chunk turn (a real reply) finishes while enabled and unmuted', () => {
    handleAssistantBusy('claude', true, 1)
    handleAssistantBusy('claude', false, 2)
    expect(playNotificationSound).toHaveBeenCalledWith('ding')
  })

  it('plays for even a short reply, as long as it streamed more than one chunk', () => {
    handleAssistantBusy('claude', true, 1)
    handleAssistantBusy('claude', false, 2)
    expect(playNotificationSound).toHaveBeenCalledTimes(1)
  })

  it('does not play for a single-chunk blip (e.g. a resize-triggered redraw)', () => {
    handleAssistantBusy('claude', true, 1)
    handleAssistantBusy('claude', false, 1)
    expect(playNotificationSound).not.toHaveBeenCalled()
  })

  it('does not play when the feature is disabled', () => {
    useNotificationSoundSettingsStore.setState({ enabled: false })
    handleAssistantBusy('claude', true, 1)
    handleAssistantBusy('claude', false, 5)
    expect(playNotificationSound).not.toHaveBeenCalled()
  })

  it('does not play when muted', () => {
    useNotificationSoundSettingsStore.setState({ muted: true })
    handleAssistantBusy('claude', true, 1)
    handleAssistantBusy('claude', false, 5)
    expect(playNotificationSound).not.toHaveBeenCalled()
  })

  it('does not play on the rising edge (idle to busy)', () => {
    handleAssistantBusy('claude', true, 5)
    expect(playNotificationSound).not.toHaveBeenCalled()
  })

  it('does not play for codex or bridge — Claude only, for now', () => {
    handleAssistantBusy('codex', true, 1)
    handleAssistantBusy('codex', false, 5)
    handleAssistantBusy('bridge', true, 1)
    handleAssistantBusy('bridge', false, 5)
    expect(playNotificationSound).not.toHaveBeenCalled()
  })

  it('plays the currently configured sound id', () => {
    useNotificationSoundSettingsStore.setState({ soundId: 'beep' })
    handleAssistantBusy('claude', true, 1)
    handleAssistantBusy('claude', false, 3)
    expect(playNotificationSound).toHaveBeenCalledWith('beep')
  })
})
