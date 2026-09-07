import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useClaudeStore } from '@/stores/claudeStore'
import { useNotificationSoundSettingsStore } from '@/stores/notificationSoundSettingsStore'

const playNotificationSound = vi.fn()

vi.mock('@/stores/notificationSoundSettingsStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/notificationSoundSettingsStore')>()
  return { ...actual, playNotificationSound: (...args: unknown[]) => playNotificationSound(...args) }
})

// Reproduced verbatim from the onClaudeBusy handler in App.tsx — importing
// App.tsx itself isn't viable here (it pulls in monaco-editor, which breaks
// at module-load time under jsdom; see App.autoFollow.test.tsx for the same
// constraint on rendering it), so this exercises the exact wiring logic in
// isolation instead.
function handleClaudeBusy(instanceId: string, busy: boolean, chunkCount: number) {
  const wasBusy = useClaudeStore.getState().busyByInstance[instanceId] ?? false
  useClaudeStore.getState().setBusy(instanceId, busy)
  if (wasBusy && !busy && chunkCount > 1) {
    const { enabled, muted, soundId } = useNotificationSoundSettingsStore.getState()
    if (enabled && !muted) playNotificationSound(soundId)
  }
}

beforeEach(() => {
  playNotificationSound.mockClear()
  useClaudeStore.setState({ busyByInstance: {} })
  useNotificationSoundSettingsStore.setState({ enabled: true, muted: false, soundId: 'ding' })
})

describe('App — Claude-done notification sound wiring', () => {
  it('plays the configured sound when a multi-chunk turn (a real reply) finishes while enabled and unmuted', () => {
    handleClaudeBusy('instance-1', true, 1)
    handleClaudeBusy('instance-1', false, 2)
    expect(playNotificationSound).toHaveBeenCalledWith('ding')
  })

  it('plays for even a short reply, as long as it streamed more than one chunk', () => {
    handleClaudeBusy('instance-1', true, 1)
    handleClaudeBusy('instance-1', false, 2)
    expect(playNotificationSound).toHaveBeenCalledTimes(1)
  })

  it('does not play for a single-chunk blip (e.g. a resize-triggered redraw)', () => {
    handleClaudeBusy('instance-1', true, 1)
    handleClaudeBusy('instance-1', false, 1)
    expect(playNotificationSound).not.toHaveBeenCalled()
  })

  it('does not play when the feature is disabled', () => {
    useNotificationSoundSettingsStore.setState({ enabled: false })
    handleClaudeBusy('instance-1', true, 1)
    handleClaudeBusy('instance-1', false, 5)
    expect(playNotificationSound).not.toHaveBeenCalled()
  })

  it('does not play when muted', () => {
    useNotificationSoundSettingsStore.setState({ muted: true })
    handleClaudeBusy('instance-1', true, 1)
    handleClaudeBusy('instance-1', false, 5)
    expect(playNotificationSound).not.toHaveBeenCalled()
  })

  it('does not play on the rising edge (idle to busy)', () => {
    handleClaudeBusy('instance-1', true, 5)
    expect(playNotificationSound).not.toHaveBeenCalled()
  })

  it('plays the currently configured sound id', () => {
    useNotificationSoundSettingsStore.setState({ soundId: 'beep' })
    handleClaudeBusy('instance-1', true, 1)
    handleClaudeBusy('instance-1', false, 3)
    expect(playNotificationSound).toHaveBeenCalledWith('beep')
  })
})
