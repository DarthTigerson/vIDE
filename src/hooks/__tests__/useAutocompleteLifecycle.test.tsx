import { describe, it, expect, beforeEach, vi } from 'vitest'
import { StrictMode, createElement, type ReactNode } from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAutocompleteLifecycle } from '../useAutocompleteLifecycle'
import { useAutocompleteSettingsStore } from '@/stores/autocompleteSettingsStore'
import type { AutocompletePhase, AutocompleteRuntimeState } from '@/types/api'

const GiB = 1024 ** 3
const settingsInitial = useAutocompleteSettingsStore.getState()

let configure: ReturnType<typeof vi.fn>
let start: ReturnType<typeof vi.fn>

function mainState(phase: AutocompletePhase, modelOnDisk: boolean): AutocompleteRuntimeState {
  return { phase, source: null, modelOnDisk, progress: null, ramBytes: null, error: null }
}

function setup(phase: AutocompletePhase, modelOnDisk: boolean) {
  configure = vi.fn().mockResolvedValue(mainState(phase, modelOnDisk))
  start = vi.fn().mockResolvedValue(undefined)
  ;(window as any).api = {
    autocompleteConfigure: configure,
    autocompleteStart: start,
    autocompleteGetState: vi.fn().mockResolvedValue(mainState(phase, modelOnDisk)),
    onAutocompleteState: () => () => {},
    getSystemMemoryUsage: vi.fn().mockResolvedValue({ totalBytes: 32 * GiB, usedBytes: 8 * GiB }),
  }
}

beforeEach(() => {
  useAutocompleteSettingsStore.setState({ ...settingsInitial, enabled: true, autoStart: true, model: 'recommended' })
})

describe('useAutocompleteLifecycle', () => {
  it('tells main which model to run for this machine', async () => {
    setup('idle', true)
    renderHook(() => useAutocompleteLifecycle())
    await waitFor(() => expect(configure).toHaveBeenCalledWith({ kind: 'managed', modelId: 'qwen-3b' }))
  })

  it('starts a model already on disk when vIDE opens', async () => {
    setup('idle', true)
    renderHook(() => useAutocompleteLifecycle())
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1))
  })

  it("still auto-starts under StrictMode's double effect run in dev", async () => {
    setup('idle', true)
    renderHook(() => useAutocompleteLifecycle(), { wrapper: ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children) })
    await waitFor(() => expect(start).toHaveBeenCalled())
  })

  it('does not start when "Start with vIDE" is off', async () => {
    useAutocompleteSettingsStore.setState({ autoStart: false })
    setup('idle', true)
    renderHook(() => useAutocompleteLifecycle())
    await waitFor(() => expect(configure).toHaveBeenCalled())
    expect(start).not.toHaveBeenCalled()
  })

  it('never downloads on its own: no start when the model is not on disk yet', async () => {
    setup('idle', false)
    renderHook(() => useAutocompleteLifecycle())
    await waitFor(() => expect(configure).toHaveBeenCalled())
    expect(start).not.toHaveBeenCalled()
  })

  it('does not restart a model the user stopped (e.g. when another window opens)', async () => {
    setup('stopped', true)
    renderHook(() => useAutocompleteLifecycle())
    await waitFor(() => expect(configure).toHaveBeenCalled())
    expect(start).not.toHaveBeenCalled()
  })

  it('stops everything (null source) when autocomplete is off', async () => {
    useAutocompleteSettingsStore.setState({ enabled: false })
    setup('idle', true)
    renderHook(() => useAutocompleteLifecycle())
    await waitFor(() => expect(configure).toHaveBeenCalledWith(null))
    expect(start).not.toHaveBeenCalled()
  })

  it('starts again when autocomplete is turned back on with the model on disk', async () => {
    useAutocompleteSettingsStore.setState({ enabled: false, autoStart: false })
    setup('idle', true)
    renderHook(() => useAutocompleteLifecycle())
    await waitFor(() => expect(configure).toHaveBeenCalledWith(null))
    act(() => { useAutocompleteSettingsStore.getState().setEnabled(true) })
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1))
  })
})
