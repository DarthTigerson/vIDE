/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { AutocompleteFooter } from '../AutocompleteFooter'
import { useAutocompleteSettingsStore } from '@/stores/autocompleteSettingsStore'
import { useAutocompleteRuntimeStore } from '@/stores/autocompleteRuntimeStore'
import { useEditorSettingsStore } from '@/stores/editorSettingsStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useEditorStore } from '@/stores/editorStore'
import type { AutocompleteRuntimeState } from '@/types/api'

const GiB = 1024 ** 3
const runtimeInitial = useAutocompleteRuntimeStore.getState()
let api: Record<string, ReturnType<typeof vi.fn>>

function runtime(patch: Partial<AutocompleteRuntimeState>) {
  useAutocompleteRuntimeStore.setState({
    snoozedUntil: null,
    state: {
      phase: 'running', source: { kind: 'managed', modelId: 'qwen-3b' }, modelOnDisk: true,
      progress: null, ramBytes: 3.6 * GiB, error: null, ...patch,
    },
  })
}

function openPanel() {
  render(<AutocompleteFooter />)
  fireEvent.click(screen.getByRole('button', { name: /^Autocomplete/ }))
}

beforeEach(() => {
  api = {
    autocompleteStart: vi.fn().mockResolvedValue(undefined),
    autocompleteStop: vi.fn().mockResolvedValue(undefined),
  }
  ;(window as any).api = api
  useAutocompleteSettingsStore.setState({ enabled: true })
  useEditorSettingsStore.setState({ inlineDiffEnabled: true, inlineDiffFooterIcon: true })
  useGitReposStore.setState({ repos: ['/repo'] })
  runtime({})
})

afterEach(() => {
  cleanup()
  useAutocompleteRuntimeStore.getState().resume()
  useAutocompleteRuntimeStore.setState(runtimeInitial)
  useGitReposStore.setState({ repos: [] })
})

describe('AutocompleteFooter', () => {
  it('shows the model and its RAM while running', () => {
    openPanel()
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Qwen2.5-Coder 3B · ~3.6 GB RAM')).toBeInTheDocument()
  })

  it('snoozes for 15 minutes and offers Resume now', () => {
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: '15 min' }))
    expect(useAutocompleteRuntimeStore.getState().isSnoozed()).toBe(true)
    expect(screen.getByText(/No suggestions until .* · model stays loaded/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Resume now' }))
    expect(useAutocompleteRuntimeStore.getState().isSnoozed()).toBe(false)
  })

  it('snoozes until resumed', () => {
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Until resumed' }))
    expect(useAutocompleteRuntimeStore.getState().snoozedUntil).toBe('resume')
    expect(screen.getByText('No suggestions until you resume · model stays loaded')).toBeInTheDocument()
  })

  it('stops the model, freeing its RAM', () => {
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Stop model · free 3.6 GB' }))
    expect(api.autocompleteStop).toHaveBeenCalled()
  })

  it('starts a stopped model', () => {
    runtime({ phase: 'stopped' })
    openPanel()
    expect(screen.getByText('Model unloaded, its memory is freed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start · ~3.6 GB' }))
    expect(api.autocompleteStart).toHaveBeenCalledWith()
  })

  it('never starts a download from the footer: sends a missing model to settings', () => {
    runtime({ phase: 'idle', modelOnDisk: false })
    const openTab = vi.fn()
    const original = useEditorStore.getState().openTab
    useEditorStore.setState({ openTab })
    openPanel()
    expect(screen.getByText('Not downloaded yet')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Start/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Set up in settings…' }))
    expect(openTab).toHaveBeenCalledWith({ path: 'settings://Editor', content: '', dirty: false })
    expect(api.autocompleteStart).not.toHaveBeenCalled()
    useEditorStore.setState({ openTab: original })
  })

  it('offers Start anyway when the model would not fit', () => {
    runtime({ phase: 'error', error: { kind: 'no-fit', message: 'Not enough free RAM (needs ~3.6 GB, 1.0 GB free)' } })
    openPanel()
    expect(screen.getByText('Not enough free RAM (needs ~3.6 GB, 1.0 GB free)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start anyway' }))
    expect(api.autocompleteStart).toHaveBeenCalledWith(true)
  })

  it('has no Start or Stop for a server vIDE does not run', () => {
    runtime({ source: { kind: 'server', url: 'http://127.0.0.1:8012', api: 'infill', apiKey: '' }, ramBytes: null })
    openPanel()
    expect(screen.queryByRole('button', { name: /Stop model/ })).toBeNull()
    expect(screen.getByRole('button', { name: '15 min' })).toBeInTheDocument()
  })

  it('toggles inline diff from the panel', () => {
    openPanel()
    fireEvent.click(screen.getByRole('switch', { name: 'Inline diff' }))
    expect(useEditorSettingsStore.getState().inlineDiffEnabled).toBe(false)
  })

  it('hides the inline diff row without a git repo', () => {
    useGitReposStore.setState({ repos: [] })
    openPanel()
    expect(screen.queryByRole('switch', { name: 'Inline diff' })).toBeNull()
  })

  it('opens Editor settings from the link', () => {
    const openTab = vi.fn()
    const original = useEditorStore.getState().openTab
    useEditorStore.setState({ openTab })
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Autocomplete settings…' }))
    expect(openTab).toHaveBeenCalledWith({ path: 'settings://Editor', content: '', dirty: false })
    useEditorStore.setState({ openTab: original })
  })

  it('with autocomplete turned off: says so, offers to turn it on, and keeps the inline diff switch', () => {
    useAutocompleteSettingsStore.setState({ enabled: false })
    runtime({ phase: 'idle', source: null })
    openPanel()
    expect(screen.getByText('Off')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '15 min' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Start/ })).toBeNull()
    expect(screen.getByRole('switch', { name: 'Inline diff' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Turn on autocomplete' }))
    expect(useAutocompleteSettingsStore.getState().enabled).toBe(true)
  })
})
