/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { ModelsSettingsPage } from '../ModelsSettingsPage'
import { useAutocompleteSettingsStore } from '@/stores/autocompleteSettingsStore'
import { useModelSettingsStore } from '@/stores/modelSettingsStore'
import { useBridgeSettingsStore } from '@/stores/bridgeSettingsStore'
import { useInlineEditSettingsStore } from '@/stores/inlineEditSettingsStore'
import { useUsagePassiveSettingsStore } from '@/stores/usagePassiveSettingsStore'
import { useCommitMessageSettingsStore } from '@/stores/commitMessageSettingsStore'
import { useNotificationSoundSettingsStore } from '@/stores/notificationSoundSettingsStore'
import { useEditorStore } from '@/stores/editorStore'
import { USAGE_GRAPH_TAB_PATH } from '@/components/Settings/paths'

function baseWindowApi() {
  return {
    usageGetPassiveEnabled: vi.fn().mockResolvedValue(false),
    usageSetPassiveEnabled: vi.fn().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  ;(global as any).window.api = baseWindowApi()
})

afterEach(() => {
  cleanup()
  useAutocompleteSettingsStore.setState({ enabled: true, model: 'claude-haiku-4-5-20251001' })
  useModelSettingsStore.setState({ enabled: { claude: true, codex: true, bridge: true } })
  useBridgeSettingsStore.setState({ endpoint: '', apiKey: '', modelId: '' })
  useInlineEditSettingsStore.setState({ enabled: true, model: 'claude-sonnet-5' })
  useUsagePassiveSettingsStore.setState({ enabled: false, initialized: false })
  useCommitMessageSettingsStore.setState({ enabled: false, model: 'claude-sonnet-5', prompt: '' })
  useNotificationSoundSettingsStore.setState({ enabled: false, muted: false, soundId: 'ding' })
})

describe('ModelsSettingsPage assistants section', () => {
  it('reflects the current enabled state for each assistant', () => {
    useModelSettingsStore.setState({ enabled: { claude: true, codex: false, bridge: true } })
    render(<ModelsSettingsPage />)
    expect(screen.getByRole('switch', { name: 'Codex' })).toHaveAttribute('aria-checked', 'false')
  })

  it('toggles an assistant on click', () => {
    render(<ModelsSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Codex' }))
    expect(useModelSettingsStore.getState().enabled.codex).toBe(false)
  })
})

describe('ModelsSettingsPage bridge section', () => {
  it('is visible when bridge is enabled', () => {
    useModelSettingsStore.setState({ enabled: { claude: true, codex: true, bridge: true } })
    render(<ModelsSettingsPage />)
    expect(screen.getByLabelText('Endpoint')).toBeTruthy()
  })

  it('is hidden when bridge is disabled', () => {
    useModelSettingsStore.setState({ enabled: { claude: true, codex: true, bridge: false } })
    render(<ModelsSettingsPage />)
    expect(screen.queryByLabelText('Endpoint')).toBeNull()
  })

  it('renders current settings values', () => {
    useBridgeSettingsStore.setState({ endpoint: 'http://host:8002/v1', apiKey: 'local', modelId: 'test-model' })
    render(<ModelsSettingsPage />)

    expect((screen.getByLabelText('Endpoint') as HTMLInputElement).value).toBe('http://host:8002/v1')
    expect((screen.getByLabelText('API Key') as HTMLInputElement).value).toBe('local')
    expect((screen.getByLabelText('Model ID') as HTMLInputElement).value).toBe('test-model')
  })

  it('updates the store when a field changes', () => {
    render(<ModelsSettingsPage />)
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'http://new:8002/v1' } })
    expect(useBridgeSettingsStore.getState().endpoint).toBe('http://new:8002/v1')
  })

  it('shows a success message when the test connection succeeds', async () => {
    ;(global as any).window.api = { ...baseWindowApi(), bridgeTestConnection: vi.fn().mockResolvedValue({ ok: true }) }
    render(<ModelsSettingsPage />)

    fireEvent.click(screen.getByText('Test Connection'))

    await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy())
  })

  it('shows an error message when the test connection fails', async () => {
    ;(global as any).window.api = { ...baseWindowApi(), bridgeTestConnection: vi.fn().mockResolvedValue({ ok: false, error: 'HTTP 401' }) }
    render(<ModelsSettingsPage />)

    fireEvent.click(screen.getByText('Test Connection'))

    await waitFor(() => expect(screen.getByText('HTTP 401')).toBeTruthy())
  })
})

describe('ModelsSettingsPage autocomplete section', () => {
  it('is force-disabled regardless of the persisted setting (VIDE-16)', () => {
    useAutocompleteSettingsStore.setState({ enabled: true })
    render(<ModelsSettingsPage />)
    const toggle = screen.getByRole('switch', { name: 'Inline Autocomplete' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(toggle).toBeDisabled()
  })

  it('does not change the stored setting on click while force-disabled', () => {
    useAutocompleteSettingsStore.setState({ enabled: false })
    render(<ModelsSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Inline Autocomplete' }))
    expect(useAutocompleteSettingsStore.getState().enabled).toBe(false)
  })

  it('disables the model picker while autocomplete is force-disabled', () => {
    render(<ModelsSettingsPage />)
    expect(screen.getByLabelText('Model')).toBeDisabled()
  })
})

describe('ModelsSettingsPage inline edit section', () => {
  it('reflects the current enabled state', () => {
    useInlineEditSettingsStore.setState({ enabled: false })
    render(<ModelsSettingsPage />)
    expect(screen.getByRole('switch', { name: 'Inline Edit (Cmd+K)' })).toHaveAttribute('aria-checked', 'false')
  })

  it('toggles inline edit on click', () => {
    render(<ModelsSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Inline Edit (Cmd+K)' }))
    expect(useInlineEditSettingsStore.getState().enabled).toBe(false)
  })

  it('reflects the current model selection', () => {
    useInlineEditSettingsStore.setState({ model: 'claude-opus-5' })
    render(<ModelsSettingsPage />)
    expect(screen.getByLabelText('Inline Edit Model')).toHaveTextContent('Opus 5')
  })

  it('updates the model when changed', () => {
    render(<ModelsSettingsPage />)
    fireEvent.click(screen.getByLabelText('Inline Edit Model'))
    fireEvent.click(screen.getByRole('option', { name: 'Haiku 4.5' }))
    expect(useInlineEditSettingsStore.getState().model).toBe('claude-haiku-4-5-20251001')
  })
})

describe('ModelsSettingsPage commit messages section', () => {
  it('reflects the current enabled state', () => {
    useCommitMessageSettingsStore.setState({ enabled: true })
    render(<ModelsSettingsPage />)
    expect(screen.getByRole('switch', { name: 'Generate commit messages' })).toHaveAttribute('aria-checked', 'true')
  })

  it('toggles on click', () => {
    render(<ModelsSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Generate commit messages' }))
    expect(useCommitMessageSettingsStore.getState().enabled).toBe(true)
  })

  it('reflects the current model selection', () => {
    useCommitMessageSettingsStore.setState({ model: 'claude-opus-5' })
    render(<ModelsSettingsPage />)
    expect(screen.getByLabelText('Commit Message Model')).toHaveTextContent('Opus 5')
  })

  it('updates the prompt when changed, leaving empty as the default sentinel', () => {
    render(<ModelsSettingsPage />)
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Always mention the ticket number' } })
    expect(useCommitMessageSettingsStore.getState().prompt).toBe('Always mention the ticket number')
  })
})

describe('ModelsSettingsPage usage monitoring section', () => {
  it('reflects the persisted passive-monitoring setting on load', async () => {
    ;(global as any).window.api = { ...baseWindowApi(), usageGetPassiveEnabled: vi.fn().mockResolvedValue(true) }
    render(<ModelsSettingsPage />)
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Passive usage monitoring' })).toHaveAttribute('aria-checked', 'true')
    )
  })

  it('toggles passive monitoring on click and persists it via IPC', async () => {
    render(<ModelsSettingsPage />)
    await waitFor(() => expect(window.api.usageGetPassiveEnabled).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('switch', { name: 'Passive usage monitoring' }))

    expect(useUsagePassiveSettingsStore.getState().enabled).toBe(true)
    expect(window.api.usageSetPassiveEnabled).toHaveBeenCalledWith(true)
  })

  it('opens the Usage Graph tab when "Open Usage Graph" is clicked', async () => {
    render(<ModelsSettingsPage />)
    await waitFor(() => expect(window.api.usageGetPassiveEnabled).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Open Usage Graph' }))

    expect(useEditorStore.getState().tabs.some((t) => t.path === USAGE_GRAPH_TAB_PATH)).toBe(true)
  })
})

describe('ModelsSettingsPage notifications section', () => {
  const { audioInstances, AudioMock } = vi.hoisted(() => {
    const audioInstances: Array<{ src: string; play: ReturnType<typeof vi.fn> }> = []
    class AudioMock {
      src: string
      play = vi.fn().mockResolvedValue(undefined)
      constructor(src: string) {
        this.src = src
        audioInstances.push(this)
      }
    }
    return { audioInstances, AudioMock }
  })

  beforeEach(() => {
    audioInstances.length = 0
    vi.stubGlobal('Audio', AudioMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reflects the current enabled state', () => {
    useNotificationSoundSettingsStore.setState({ enabled: true })
    render(<ModelsSettingsPage />)
    expect(screen.getByRole('switch', { name: 'Play sound when Claude is done' })).toHaveAttribute('aria-checked', 'true')
  })

  it('hides the sound picker and test button while disabled', () => {
    render(<ModelsSettingsPage />)
    expect(screen.queryByLabelText('Sound')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Test sound' })).toBeNull()
  })

  it('shows the sound picker and test button once enabled', () => {
    render(<ModelsSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Play sound when Claude is done' }))
    expect(screen.getByLabelText('Sound')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Test sound' })).toBeTruthy()
  })

  it('toggles the setting on click', () => {
    render(<ModelsSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Play sound when Claude is done' }))
    expect(useNotificationSoundSettingsStore.getState().enabled).toBe(true)
  })

  it('updates the selected sound when changed', () => {
    useNotificationSoundSettingsStore.setState({ enabled: true })
    render(<ModelsSettingsPage />)
    fireEvent.click(screen.getByLabelText('Sound'))
    fireEvent.click(screen.getByRole('option', { name: 'Beep' }))
    expect(useNotificationSoundSettingsStore.getState().soundId).toBe('beep')
  })

  it('plays the selected sound when the test button is clicked', () => {
    useNotificationSoundSettingsStore.setState({ enabled: true, soundId: 'beep' })
    render(<ModelsSettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Test sound' }))
    expect(audioInstances).toHaveLength(1)
    expect(audioInstances[0].play).toHaveBeenCalled()
  })
})
