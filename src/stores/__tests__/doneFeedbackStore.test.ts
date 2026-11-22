import { describe, it, expect, beforeEach, vi } from 'vitest'

const { store } = vi.hoisted(() => {
  const store: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
  }
  return { store }
})

async function load() {
  vi.resetModules()
  return import('../doneFeedbackStore')
}

beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k])
})

describe('doneFeedbackStore defaults', () => {
  it('starts off, both agents on, amy, first sentence, 1x, first sound', async () => {
    const { useDoneFeedbackStore, DONE_SOUND_OPTIONS } = await load()
    const s = useDoneFeedbackStore.getState()
    expect(s.mode).toBe('off')
    expect(s.agents).toEqual({ claude: true, rocky: true })
    expect(s.voiceId).toBe('amy')
    expect(s.readAloud).toBe('first')
    expect(s.speed).toBe(1)
    expect(s.soundId).toBe(DONE_SOUND_OPTIONS[0].id)
  })
})

describe('legacy migration', () => {
  it('enabled and not muted becomes sound', async () => {
    store['vide:claudeDoneSound:enabled'] = 'true'
    const { useDoneFeedbackStore } = await load()
    expect(useDoneFeedbackStore.getState().mode).toBe('sound')
  })
  it('enabled but muted becomes off', async () => {
    store['vide:claudeDoneSound:enabled'] = 'true'
    store['vide:claudeDoneSound:muted'] = 'true'
    const { useDoneFeedbackStore } = await load()
    expect(useDoneFeedbackStore.getState().mode).toBe('off')
  })
  it('a saved mode wins over legacy keys', async () => {
    store['vide:claudeDoneSound:enabled'] = 'true'
    store['vide:doneFeedback:mode'] = 'speak'
    const { useDoneFeedbackStore } = await load()
    expect(useDoneFeedbackStore.getState().mode).toBe('speak')
  })
})

describe('persistence', () => {
  it('restores every setting after a reload', async () => {
    const first = await load()
    const s = first.useDoneFeedbackStore.getState()
    s.setMode('speak')
    s.setAgent('rocky', false)
    s.setSoundId('beep')
    s.setVoiceId('ryan')
    s.setReadAloud('full')
    s.setSpeed(1.3)

    const second = await load()
    const r = second.useDoneFeedbackStore.getState()
    expect(r.mode).toBe('speak')
    expect(r.agents).toEqual({ claude: true, rocky: false })
    expect(r.soundId).toBe('beep')
    expect(r.voiceId).toBe('ryan')
    expect(r.readAloud).toBe('full')
    expect(r.speed).toBe(1.3)
  })
})

describe('setSpeed', () => {
  it('clamps to 0.7-1.5 and rounds to 0.1', async () => {
    const { useDoneFeedbackStore } = await load()
    const { setSpeed } = useDoneFeedbackStore.getState()
    setSpeed(5)
    expect(useDoneFeedbackStore.getState().speed).toBe(1.5)
    setSpeed(0.2)
    expect(useDoneFeedbackStore.getState().speed).toBe(0.7)
    setSpeed(1.23)
    expect(useDoneFeedbackStore.getState().speed).toBe(1.2)
  })
})
