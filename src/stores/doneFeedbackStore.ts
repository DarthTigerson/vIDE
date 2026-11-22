import { create } from 'zustand'
import notificationDingUrl from '@/assets/notificationDing.mp3'
import notificationBeepUrl from '@/assets/notificationBeep.mp3'

// Settings › Sound & Voice: what vIDE does when Claude or Rocky finishes a
// turn. Replaces the old "Done sound" (enabled + muted) pair on Settings ›
// Claude; those keys are read once below to pick the starting mode.

export type DoneMode = 'off' | 'sound' | 'speak'
export type ReadAloud = 'first' | 'full' | 'done'
export type DoneAgent = 'claude' | 'rocky'

export interface DoneSoundOption { id: string; label: string; url: string }

export const DONE_SOUND_OPTIONS: DoneSoundOption[] = [
  { id: 'ding', label: 'Ding', url: notificationDingUrl },
  { id: 'beep', label: 'Beep', url: notificationBeepUrl },
]

export const READ_ALOUD_OPTIONS: { value: ReadAloud; label: string }[] = [
  { value: 'first', label: 'First sentence' },
  { value: 'full', label: 'Whole reply' },
  { value: 'done', label: 'Just "Claude finished"' },
]

export const DEFAULT_VOICE_ID = 'amy'
export const MIN_SPEED = 0.7
export const MAX_SPEED = 1.5

const MODE_KEY = 'vide:doneFeedback:mode'
const AGENTS_KEY = 'vide:doneFeedback:agents'
const VOICE_KEY = 'vide:doneFeedback:voice'
const READ_KEY = 'vide:doneFeedback:readAloud'
const SPEED_KEY = 'vide:doneFeedback:speed'
// Kept from the old feature so a picked sound carries over.
const SOUND_KEY = 'vide:claudeDoneSound:soundId'
const LEGACY_ENABLED_KEY = 'vide:claudeDoneSound:enabled'
const LEGACY_MUTED_KEY = 'vide:claudeDoneSound:muted'

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function write(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch {}
}

function loadMode(): DoneMode {
  const raw = read(MODE_KEY)
  if (raw === 'off' || raw === 'sound' || raw === 'speak') return raw
  // First run after the change: an enabled, unmuted done sound stays on.
  return read(LEGACY_ENABLED_KEY) === 'true' && read(LEGACY_MUTED_KEY) !== 'true' ? 'sound' : 'off'
}

function loadAgents(): Record<DoneAgent, boolean> {
  try {
    const parsed = JSON.parse(read(AGENTS_KEY) ?? '{}')
    return { claude: parsed.claude !== false, rocky: parsed.rocky !== false }
  } catch {
    return { claude: true, rocky: true }
  }
}

function loadSoundId(): string {
  const raw = read(SOUND_KEY)
  return DONE_SOUND_OPTIONS.some((s) => s.id === raw) ? (raw as string) : DONE_SOUND_OPTIONS[0].id
}

function loadReadAloud(): ReadAloud {
  const raw = read(READ_KEY)
  return raw === 'full' || raw === 'done' ? raw : 'first'
}

export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1
  return Math.round(Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed)) * 10) / 10
}

function loadSpeed(): number {
  const raw = read(SPEED_KEY)
  return raw === null ? 1 : clampSpeed(Number(raw))
}

interface DoneFeedbackStore {
  mode: DoneMode
  agents: Record<DoneAgent, boolean>
  soundId: string
  voiceId: string
  readAloud: ReadAloud
  speed: number
  setMode: (mode: DoneMode) => void
  setAgent: (agent: DoneAgent, on: boolean) => void
  setSoundId: (id: string) => void
  setVoiceId: (id: string) => void
  setReadAloud: (value: ReadAloud) => void
  setSpeed: (speed: number) => void
}

export const useDoneFeedbackStore = create<DoneFeedbackStore>((set, get) => ({
  mode: loadMode(),
  agents: loadAgents(),
  soundId: loadSoundId(),
  voiceId: read(VOICE_KEY) ?? DEFAULT_VOICE_ID,
  readAloud: loadReadAloud(),
  speed: loadSpeed(),

  setMode: (mode) => { write(MODE_KEY, mode); set({ mode }) },
  setAgent: (agent, on) => {
    const agents = { ...get().agents, [agent]: on }
    write(AGENTS_KEY, JSON.stringify(agents))
    set({ agents })
  },
  setSoundId: (soundId) => { write(SOUND_KEY, soundId); set({ soundId }) },
  setVoiceId: (voiceId) => { write(VOICE_KEY, voiceId); set({ voiceId }) },
  setReadAloud: (readAloud) => { write(READ_KEY, readAloud); set({ readAloud }) },
  setSpeed: (speed) => {
    const clamped = clampSpeed(speed)
    write(SPEED_KEY, String(clamped))
    set({ speed: clamped })
  },
}))

// One clip at a time: a new sound or utterance cuts off the one playing.
let current: HTMLAudioElement | null = null
let currentUrl: string | null = null

function play(audio: HTMLAudioElement, objectUrl: string | null = null): void {
  stopPlayback()
  current = audio
  currentUrl = objectUrl
  audio.addEventListener('ended', () => { if (current === audio) stopPlayback() })
  audio.play().catch(() => {
    // Autoplay can be blocked before the user has interacted with the window.
  })
}

export function stopPlayback(): void {
  current?.pause()
  current = null
  if (currentUrl) URL.revokeObjectURL(currentUrl)
  currentUrl = null
}

export function playDoneSound(soundId: string): void {
  const sound = DONE_SOUND_OPTIONS.find((s) => s.id === soundId) ?? DONE_SOUND_OPTIONS[0]
  play(new Audio(sound.url))
}

// Synthesizes locally (electron/tts) and plays the result. Resolves false
// when the engine or voice isn't installed or synthesis failed, so callers
// can fall back to the done sound.
export async function speak(text: string, voiceId: string, speed: number): Promise<boolean> {
  const result = await window.api.ttsSpeak(text, voiceId, speed)
  if (!result.ok) return false
  const url = URL.createObjectURL(new Blob([result.wav as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }))
  play(new Audio(url), url)
  return true
}
