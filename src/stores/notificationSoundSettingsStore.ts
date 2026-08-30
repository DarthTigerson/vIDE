import { create } from 'zustand'
import notificationDingUrl from '@/assets/notificationDing.mp3'
import notificationBeepUrl from '@/assets/notificationBeep.mp3'

const ENABLED_KEY = 'vide:claudeDoneSound:enabled'
const MUTED_KEY = 'vide:claudeDoneSound:muted'
const SOUND_KEY = 'vide:claudeDoneSound:soundId'

export interface NotificationSoundOption {
  id: string
  label: string
  url: string
}

export const NOTIFICATION_SOUND_OPTIONS: NotificationSoundOption[] = [
  { id: 'ding', label: 'Ding', url: notificationDingUrl },
  { id: 'beep', label: 'Beep', url: notificationBeepUrl },
]

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : raw === 'true'
  } catch {
    return fallback
  }
}

function loadSoundId(): string {
  try {
    const raw = localStorage.getItem(SOUND_KEY)
    return NOTIFICATION_SOUND_OPTIONS.some((s) => s.id === raw) ? (raw as string) : NOTIFICATION_SOUND_OPTIONS[0].id
  } catch {
    return NOTIFICATION_SOUND_OPTIONS[0].id
  }
}

interface NotificationSoundSettingsStore {
  enabled: boolean
  muted: boolean
  soundId: string
  setEnabled: (value: boolean) => void
  setMuted: (value: boolean) => void
  setSoundId: (id: string) => void
}

export const useNotificationSoundSettingsStore = create<NotificationSoundSettingsStore>((set) => ({
  enabled: loadBool(ENABLED_KEY, false),
  // Independent of `enabled` — a quick mute/unmute toggle (title bar) that
  // silences the sound without turning the feature off in Settings.
  muted: loadBool(MUTED_KEY, false),
  soundId: loadSoundId(),

  setEnabled: (value) => {
    try { localStorage.setItem(ENABLED_KEY, String(value)) } catch {}
    set({ enabled: value })
  },

  setMuted: (value) => {
    try { localStorage.setItem(MUTED_KEY, String(value)) } catch {}
    set({ muted: value })
  },

  setSoundId: (id) => {
    try { localStorage.setItem(SOUND_KEY, id) } catch {}
    set({ soundId: id })
  },
}))

export function playNotificationSound(soundId: string): void {
  const sound = NOTIFICATION_SOUND_OPTIONS.find((s) => s.id === soundId) ?? NOTIFICATION_SOUND_OPTIONS[0]
  const audio = new Audio(sound.url)
  audio.play().catch(() => {
    // Autoplay can be blocked before the user has interacted with the
    // window at all — same defensive no-op as the EasterEgg sounds.
  })
}
