/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { SoundSettingsPage } from '../SoundSettingsPage'
import { useDoneFeedbackStore } from '@/stores/doneFeedbackStore'

const audioInstances: Array<{ src: string }> = []
class AudioMock {
  src: string
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  addEventListener = vi.fn()
  constructor(src: string) {
    this.src = src
    audioInstances.push(this)
  }
}

const VOICES = [
  { id: 'amy', name: 'Amy', description: 'English (US) · female', bytes: 67223746, recommended: true, installed: true },
  { id: 'ryan', name: 'Ryan', description: 'English (US) · male', bytes: 67213100, installed: false },
]

let api: Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  audioInstances.length = 0
  vi.stubGlobal('Audio', AudioMock)
  api = {
    ttsListVoices: vi.fn().mockResolvedValue(VOICES),
    ttsGetInstall: vi.fn().mockResolvedValue({ path: '/engine', version: 'v1' }),
    ttsInstall: vi.fn().mockResolvedValue({ ok: true }),
    onTtsInstallProgress: vi.fn().mockReturnValue(() => {}),
    onTtsVoiceProgress: vi.fn().mockReturnValue(() => {}),
    ttsInstallVoice: vi.fn().mockResolvedValue({ ok: true }),
    ttsSpeak: vi.fn().mockResolvedValue({ ok: false }),
  }
  ;(global as any).window.api = api
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useDoneFeedbackStore.setState({ mode: 'off', agents: { claude: true, rocky: true }, voiceId: 'amy', soundId: 'ding' })
})

describe('SoundSettingsPage', () => {
  it('renders the heading and voice cards', async () => {
    render(<SoundSettingsPage />)
    expect(screen.getByRole('heading', { name: 'Sound & Voice' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: /^Amy/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Ryan/ })).toBeTruthy()
  })

  it('picks a voice by clicking its card name', async () => {
    render(<SoundSettingsPage />)
    fireEvent.click(await screen.findByRole('button', { name: /^Ryan/ }))
    expect(useDoneFeedbackStore.getState().voiceId).toBe('ryan')
  })

  it('downloads an uninstalled voice', async () => {
    render(<SoundSettingsPage />)
    await screen.findByRole('button', { name: /^Ryan/ })
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(api.ttsInstallVoice).toHaveBeenCalledWith('ryan'))
  })

  it('updates agents from the Claude and Rocky switches', () => {
    render(<SoundSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Claude' }))
    expect(useDoneFeedbackStore.getState().agents.claude).toBe(false)
    fireEvent.click(screen.getByRole('switch', { name: 'Rocky' }))
    expect(useDoneFeedbackStore.getState().agents.rocky).toBe(false)
  })

  it('plays the selected sound from the test button', () => {
    useDoneFeedbackStore.setState({ soundId: 'beep' })
    render(<SoundSettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Test sound' }))
    expect(audioInstances).toHaveLength(1)
  })
})
