import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Autocomplete is force-disabled globally while VIDE-16 is reworked (see
// autocompleteEffectiveState.ts). This file tests provideInlineCompletion's
// own mechanics (debounce, IPC call, busy toggle, cancellation) in isolation
// from that global gate, which has its own dedicated test coverage.
const isAutocompleteEffectivelyEnabled = vi.fn()
vi.mock('../autocompleteEffectiveState', () => ({
  isAutocompleteEffectivelyEnabled: () => isAutocompleteEffectivelyEnabled(),
}))

import { provideInlineCompletion } from '../monacoAutocomplete'
import { useAutocompleteSettingsStore } from '@/stores/autocompleteSettingsStore'
import { useAutocompleteSessionStore } from '@/stores/autocompleteSessionStore'
import { useAutocompleteStatusStore } from '@/stores/autocompleteStatusStore'

function fakeModel() {
  return {
    getLineCount: () => 1,
    getLineMaxColumn: () => 1,
    getValueInRange: () => '',
    getLanguageId: () => 'typescript',
  }
}

function fakeToken(cancelled = false) {
  return { isCancellationRequested: cancelled }
}

describe('provideInlineCompletion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    isAutocompleteEffectivelyEnabled.mockReset().mockReturnValue(true)
    useAutocompleteSettingsStore.setState({ enabled: true, model: 'claude-haiku-4-5-20251001' })
    useAutocompleteSessionStore.setState({ paused: false })
    useAutocompleteStatusStore.setState({ busy: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns no items immediately when the effective-enabled gate is false', async () => {
    isAutocompleteEffectivelyEnabled.mockReturnValue(false)
    ;(global as any).window = { api: { autocompleteComplete: vi.fn() } }

    const result = await provideInlineCompletion(fakeModel(), { lineNumber: 1, column: 1 }, fakeToken())

    expect(result).toEqual([])
    expect(window.api.autocompleteComplete).not.toHaveBeenCalled()
  })

  it('returns no items if the gate flips to false during the debounce wait', async () => {
    const apiMock = vi.fn().mockResolvedValue('x')
    ;(global as any).window = { api: { autocompleteComplete: apiMock } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 1, column: 1 }, fakeToken())
    isAutocompleteEffectivelyEnabled.mockReturnValue(false)
    await vi.advanceTimersByTimeAsync(700)

    expect(await promise).toEqual([])
    expect(apiMock).not.toHaveBeenCalled()
  })

  it('returns no items if cancelled during the debounce wait', async () => {
    const token = fakeToken(false)
    ;(global as any).window = { api: { autocompleteComplete: vi.fn().mockResolvedValue('x') } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 1, column: 1 }, token)
    token.isCancellationRequested = true
    await vi.advanceTimersByTimeAsync(700)

    expect(await promise).toEqual([])
    expect(window.api.autocompleteComplete).not.toHaveBeenCalled()
  })

  it('calls the IPC bridge after the debounce and returns an insertable item', async () => {
    const apiMock = vi.fn().mockResolvedValue('console.log()')
    ;(global as any).window = { api: { autocompleteComplete: apiMock } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 3, column: 5 }, fakeToken())
    await vi.advanceTimersByTimeAsync(700)
    const result = await promise

    expect(apiMock).toHaveBeenCalledWith('', '', 'typescript', 'claude-haiku-4-5-20251001')
    expect(result).toEqual([{
      insertText: 'console.log()',
      range: { startLineNumber: 3, startColumn: 5, endLineNumber: 3, endColumn: 5 },
    }])
  })

  it('toggles the busy status store around the IPC call', async () => {
    let busyDuringCall = false
    const apiMock = vi.fn().mockImplementation(async () => {
      busyDuringCall = useAutocompleteStatusStore.getState().busy
      return 'x'
    })
    ;(global as any).window = { api: { autocompleteComplete: apiMock } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 1, column: 1 }, fakeToken())
    await vi.advanceTimersByTimeAsync(700)
    await promise

    expect(busyDuringCall).toBe(true)
    expect(useAutocompleteStatusStore.getState().busy).toBe(false)
  })

  it('returns no items when the completion result is null', async () => {
    ;(global as any).window = { api: { autocompleteComplete: vi.fn().mockResolvedValue(null) } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 1, column: 1 }, fakeToken())
    await vi.advanceTimersByTimeAsync(700)

    expect(await promise).toEqual([])
  })

  it('resolves to no items (not a rejection) when the IPC call rejects, and still resets busy', async () => {
    const apiMock = vi.fn().mockRejectedValue(new Error('renderer/main IPC failure'))
    ;(global as any).window = { api: { autocompleteComplete: apiMock } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 1, column: 1 }, fakeToken())
    await vi.advanceTimersByTimeAsync(700)

    await expect(promise).resolves.toEqual([])
    expect(useAutocompleteStatusStore.getState().busy).toBe(false)
  })
})
