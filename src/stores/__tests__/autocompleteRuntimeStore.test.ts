import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAutocompleteRuntimeStore } from '../autocompleteRuntimeStore'

const initial = useAutocompleteRuntimeStore.getState()

describe('autocompleteRuntimeStore snooze', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useAutocompleteRuntimeStore.setState({ ...initial, snoozedUntil: null })
  })
  afterEach(() => { vi.useRealTimers() })

  it('snoozes for 15 minutes, then wakes on its own', () => {
    const now = Date.now()
    useAutocompleteRuntimeStore.getState().snooze(15)
    expect(useAutocompleteRuntimeStore.getState().isSnoozed(now + 14 * 60e3)).toBe(true)
    expect(useAutocompleteRuntimeStore.getState().isSnoozed(now + 16 * 60e3)).toBe(false)
    vi.advanceTimersByTime(15 * 60e3 + 1)
    expect(useAutocompleteRuntimeStore.getState().snoozedUntil).toBeNull()
  })

  it('stays snoozed until resumed', () => {
    useAutocompleteRuntimeStore.getState().snooze('resume')
    expect(useAutocompleteRuntimeStore.getState().isSnoozed(Date.now() + 24 * 3600e3)).toBe(true)
    useAutocompleteRuntimeStore.getState().resume()
    expect(useAutocompleteRuntimeStore.getState().isSnoozed()).toBe(false)
  })

  it('a resume cancels a timed snooze', () => {
    useAutocompleteRuntimeStore.getState().snooze(60)
    useAutocompleteRuntimeStore.getState().resume()
    expect(useAutocompleteRuntimeStore.getState().isSnoozed()).toBe(false)
  })
})

describe('autocompleteRuntimeStore init', () => {
  it('loads the current state once and follows pushed updates', async () => {
    let push: ((s: unknown) => void) | null = null
    const getState = vi.fn().mockResolvedValue({ ...initial.state, phase: 'running' })
    ;(global as any).window = {
      api: {
        autocompleteGetState: getState,
        onAutocompleteState: (cb: (s: unknown) => void) => { push = cb; return () => {} },
      },
    }
    useAutocompleteRuntimeStore.getState().init()
    useAutocompleteRuntimeStore.getState().init()
    await vi.waitFor(() => expect(useAutocompleteRuntimeStore.getState().state.phase).toBe('running'))
    expect(getState).toHaveBeenCalledTimes(1)
    push!({ ...initial.state, phase: 'stopped' })
    expect(useAutocompleteRuntimeStore.getState().state.phase).toBe('stopped')
  })
})
