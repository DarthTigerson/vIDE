/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { AutocompleteSection } from '../AutocompleteSection'
import { useAutocompleteSettingsStore } from '@/stores/autocompleteSettingsStore'
import { useAutocompleteRuntimeStore } from '@/stores/autocompleteRuntimeStore'
import type { AutocompleteRuntimeState } from '@/types/api'

const GiB = 1024 ** 3
const settingsInitial = useAutocompleteSettingsStore.getState()
const runtimeInitial = useAutocompleteRuntimeStore.getState()
let api: Record<string, ReturnType<typeof vi.fn>>

function runtime(patch: Partial<AutocompleteRuntimeState>) {
  useAutocompleteRuntimeStore.setState({
    state: {
      phase: 'idle', source: { kind: 'managed', modelId: 'qwen-1.5b' }, modelOnDisk: false,
      progress: null, ramBytes: 1646573056 + 300 * 1024 ** 2, error: null, ...patch,
    },
  })
}

beforeEach(() => {
  api = {
    getSystemMemoryUsage: vi.fn().mockResolvedValue({ totalBytes: 8 * GiB, usedBytes: 5 * GiB }),
    autocompleteStart: vi.fn().mockResolvedValue(undefined),
    autocompleteStop: vi.fn().mockResolvedValue(undefined),
    openFile: vi.fn().mockResolvedValue('/models/custom.gguf'),
  }
  ;(window as any).api = api
  useAutocompleteSettingsStore.setState({ ...settingsInitial, enabled: true })
  runtime({})
})

afterEach(() => {
  cleanup()
  useAutocompleteRuntimeStore.setState(runtimeInitial)
})

async function renderLoaded() {
  render(<AutocompleteSection />)
  await screen.findByText('This Mac: 8.0 GB, 3.0 GB free right now')
}

describe('AutocompleteSection', () => {
  it('recommends the 1.5B model on an 8 GB machine and greys out what will not fit', async () => {
    await renderLoaded()
    expect(screen.getByRole('button', { name: /Qwen2.5-Coder 1.5B/ })).toHaveTextContent('Recommended')
    expect(screen.getByRole('button', { name: /Qwen2.5-Coder 3B/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Mellum 4B/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Custom/ })).toBeEnabled()
  })

  it('downloads and starts with one click', async () => {
    await renderLoaded()
    fireEvent.click(screen.getByRole('button', { name: /^Download & start/ }))
    expect(api.autocompleteStart).toHaveBeenCalledWith()
  })

  it('just starts a model that is already on disk', async () => {
    runtime({ modelOnDisk: true })
    await renderLoaded()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(api.autocompleteStart).toHaveBeenCalledWith()
  })

  it('shows download progress with a Cancel button', async () => {
    runtime({ phase: 'downloading', progress: { received: 50, total: 100 } })
    await renderLoaded()
    expect(screen.getByText(/50%/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(api.autocompleteStop).toHaveBeenCalled()
  })

  it('stops a running model', async () => {
    runtime({ phase: 'running', modelOnDisk: true })
    await renderLoaded()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(api.autocompleteStop).toHaveBeenCalled()
  })

  it('offers "Start anyway" when there is not enough free RAM', async () => {
    runtime({ phase: 'error', error: { kind: 'no-fit', message: 'Not enough free RAM (needs ~1.8 GB, 0.9 GB free)' } })
    await renderLoaded()
    expect(screen.getByText('Not enough free RAM (needs ~1.8 GB, 0.9 GB free)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start anyway' }))
    expect(api.autocompleteStart).toHaveBeenCalledWith(true)
  })

  it('selecting another model saves the choice', async () => {
    useAutocompleteSettingsStore.setState({ model: 'recommended' })
    api.getSystemMemoryUsage.mockResolvedValue({ totalBytes: 32 * GiB, usedBytes: 8 * GiB })
    render(<AutocompleteSection />)
    await screen.findByText('This Mac: 32.0 GB, 24.0 GB free right now')
    fireEvent.click(screen.getByRole('button', { name: /Mellum 4B/ }))
    expect(useAutocompleteSettingsStore.getState().model).toBe('mellum-4b')
  })

  it('toggles "Start with vIDE"', async () => {
    await renderLoaded()
    fireEvent.click(screen.getByRole('switch', { name: 'Start with vIDE' }))
    expect(useAutocompleteSettingsStore.getState().autoStart).toBe(false)
  })

  it('custom: picks a GGUF file with the file dialog', async () => {
    useAutocompleteSettingsStore.setState({ model: 'custom', customKind: 'gguf' })
    runtime({ source: { kind: 'gguf', path: '', extraArgs: '' }, ramBytes: null })
    await renderLoaded()
    fireEvent.click(screen.getByRole('button', { name: 'Browse…' }))
    await waitFor(() => expect(useAutocompleteSettingsStore.getState().ggufPath).toBe('/models/custom.gguf'))
    expect(api.openFile).toHaveBeenCalledWith({ filters: [{ name: 'GGUF model', extensions: ['gguf'] }] })
  })

  it('custom: switching to "Running server" shows the server fields', async () => {
    useAutocompleteSettingsStore.setState({ model: 'custom', customKind: 'gguf' })
    await renderLoaded()
    fireEvent.click(screen.getByRole('button', { name: 'Running server' }))
    expect(useAutocompleteSettingsStore.getState().customKind).toBe('server')
    expect(screen.getByLabelText('Server URL')).toHaveValue('http://127.0.0.1:8012')
  })
})
