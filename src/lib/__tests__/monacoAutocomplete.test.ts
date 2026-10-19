import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// This file tests provideInlineCompletion's own mechanics (debounce, IPC
// call, busy toggle, cancellation) in isolation from the enabled/running/
// snoozed gate, which has its own coverage in autocompleteEffectiveState.test.ts.
const isAutocompleteEffectivelyEnabled = vi.fn()
vi.mock('../autocompleteEffectiveState', () => ({
  isAutocompleteEffectivelyEnabled: () => isAutocompleteEffectivelyEnabled(),
}))

import { provideInlineCompletion } from '../monacoAutocomplete'
import { useAutocompleteRuntimeStore } from '@/stores/autocompleteRuntimeStore'

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
    useAutocompleteRuntimeStore.setState({ busy: false })
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
    await vi.advanceTimersByTimeAsync(150)

    expect(await promise).toEqual([])
    expect(apiMock).not.toHaveBeenCalled()
  })

  it('returns no items if cancelled during the debounce wait', async () => {
    const token = fakeToken(false)
    ;(global as any).window = { api: { autocompleteComplete: vi.fn().mockResolvedValue('x') } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 1, column: 1 }, token)
    token.isCancellationRequested = true
    await vi.advanceTimersByTimeAsync(150)

    expect(await promise).toEqual([])
    expect(window.api.autocompleteComplete).not.toHaveBeenCalled()
  })

  it('calls the IPC bridge after the debounce and returns an insertable item', async () => {
    const apiMock = vi.fn().mockResolvedValue('console.log()')
    ;(global as any).window = { api: { autocompleteComplete: apiMock } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 3, column: 5 }, fakeToken())
    await vi.advanceTimersByTimeAsync(150)
    const result = await promise

    expect(apiMock).toHaveBeenCalledWith('', '')
    expect(result).toEqual([{
      insertText: 'console.log()',
      range: { startLineNumber: 3, startColumn: 5, endLineNumber: 3, endColumn: 5 },
    }])
  })

  it('toggles the busy status store around the IPC call', async () => {
    let busyDuringCall = false
    const apiMock = vi.fn().mockImplementation(async () => {
      busyDuringCall = useAutocompleteRuntimeStore.getState().busy
      return 'x'
    })
    ;(global as any).window = { api: { autocompleteComplete: apiMock } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 1, column: 1 }, fakeToken())
    await vi.advanceTimersByTimeAsync(150)
    await promise

    expect(busyDuringCall).toBe(true)
    expect(useAutocompleteRuntimeStore.getState().busy).toBe(false)
  })

  it('returns no items when the completion result is null', async () => {
    ;(global as any).window = { api: { autocompleteComplete: vi.fn().mockResolvedValue(null) } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 1, column: 1 }, fakeToken())
    await vi.advanceTimersByTimeAsync(150)

    expect(await promise).toEqual([])
  })

  it('resolves to no items (not a rejection) when the IPC call rejects, and still resets busy', async () => {
    const apiMock = vi.fn().mockRejectedValue(new Error('renderer/main IPC failure'))
    ;(global as any).window = { api: { autocompleteComplete: apiMock } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 1, column: 1 }, fakeToken())
    await vi.advanceTimersByTimeAsync(150)

    await expect(promise).resolves.toEqual([])
    expect(useAutocompleteRuntimeStore.getState().busy).toBe(false)
  })

  it('waits for typing to pause: nothing is sent before 150ms', async () => {
    const apiMock = vi.fn().mockResolvedValue('x')
    ;(global as any).window = { api: { autocompleteComplete: apiMock } }

    const promise = provideInlineCompletion(fakeModel(), { lineNumber: 1, column: 1 }, fakeToken())
    await vi.advanceTimersByTimeAsync(100)
    expect(apiMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(50)
    await promise
    expect(apiMock).toHaveBeenCalledTimes(1)
  })
})
