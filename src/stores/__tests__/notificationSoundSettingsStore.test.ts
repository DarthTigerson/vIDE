import { describe, it, expect, beforeEach, vi } from 'vitest'

const { localStorageStore } = vi.hoisted(() => {
  const localStorageStore: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
    clear: () => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]) },
  }
  return { localStorageStore }
})

describe('notificationSoundSettingsStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    vi.resetModules()
  })

  it('defaults to disabled, unmuted, and the first sound option', async () => {
    const { useNotificationSoundSettingsStore, NOTIFICATION_SOUND_OPTIONS } = await import('../notificationSoundSettingsStore')
    const state = useNotificationSoundSettingsStore.getState()
    expect(state.enabled).toBe(false)
    expect(state.muted).toBe(false)
    expect(state.soundId).toBe(NOTIFICATION_SOUND_OPTIONS[0].id)
  })

  it('persists enabled, muted, and soundId across store reloads', async () => {
    const { useNotificationSoundSettingsStore } = await import('../notificationSoundSettingsStore')
    useNotificationSoundSettingsStore.getState().setEnabled(true)
    useNotificationSoundSettingsStore.getState().setMuted(true)
    useNotificationSoundSettingsStore.getState().setSoundId('beep')

    vi.resetModules()
    const { useNotificationSoundSettingsStore: reloaded } = await import('../notificationSoundSettingsStore')
    const state = reloaded.getState()
    expect(state.enabled).toBe(true)
    expect(state.muted).toBe(true)
    expect(state.soundId).toBe('beep')
  })

  it('falls back to the first sound option when the persisted soundId is unknown', async () => {
    localStorage.setItem('vide:claudeDoneSound:soundId', 'not-a-real-sound')
    const { useNotificationSoundSettingsStore, NOTIFICATION_SOUND_OPTIONS } = await import('../notificationSoundSettingsStore')
    expect(useNotificationSoundSettingsStore.getState().soundId).toBe(NOTIFICATION_SOUND_OPTIONS[0].id)
  })

  it('muted is independent of enabled — toggling one leaves the other untouched', async () => {
    const { useNotificationSoundSettingsStore } = await import('../notificationSoundSettingsStore')
    useNotificationSoundSettingsStore.getState().setEnabled(true)
    useNotificationSoundSettingsStore.getState().setMuted(true)
    useNotificationSoundSettingsStore.getState().setEnabled(false)
    expect(useNotificationSoundSettingsStore.getState().muted).toBe(true)
  })

  it('playNotificationSound plays the matching option, falling back to the first option for an unknown id', async () => {
    const audioInstances: Array<{ src: string; play: ReturnType<typeof vi.fn> }> = []
    class AudioMock {
      src: string
      play = vi.fn().mockResolvedValue(undefined)
      constructor(src: string) {
        this.src = src
        audioInstances.push(this)
      }
    }
    vi.stubGlobal('Audio', AudioMock)

    const { playNotificationSound, NOTIFICATION_SOUND_OPTIONS } = await import('../notificationSoundSettingsStore')

    playNotificationSound('beep')
    expect(audioInstances[0].src).toBe(NOTIFICATION_SOUND_OPTIONS.find((s) => s.id === 'beep')!.url)
    expect(audioInstances[0].play).toHaveBeenCalled()

    playNotificationSound('not-a-real-sound')
    expect(audioInstances[1].src).toBe(NOTIFICATION_SOUND_OPTIONS[0].url)

    vi.unstubAllGlobals()
  })
})
