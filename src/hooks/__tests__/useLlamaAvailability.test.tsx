import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLlamaAvailability } from '../useLlamaAvailability'
import { useLlamaStore } from '@/stores/llamaStore'

let checkAvailable: ReturnType<typeof vi.fn>

beforeEach(() => {
  checkAvailable = vi.fn().mockResolvedValue(undefined)
  useLlamaStore.setState({ available: null, checking: false, checkAvailable })
})

describe('useLlamaAvailability', () => {
  it('probes once when the Llama feature is on and availability is unknown', () => {
    renderHook(() => useLlamaAvailability(true))
    expect(checkAvailable).toHaveBeenCalledTimes(1)
  })

  it('does not probe when the feature is off', () => {
    renderHook(() => useLlamaAvailability(false))
    expect(checkAvailable).not.toHaveBeenCalled()
  })

  it('does not probe again once availability is known', () => {
    useLlamaStore.setState({ available: false })
    renderHook(() => useLlamaAvailability(true))
    expect(checkAvailable).not.toHaveBeenCalled()
  })

  it('does not stack a probe while one is already running', () => {
    useLlamaStore.setState({ checking: true })
    renderHook(() => useLlamaAvailability(true))
    expect(checkAvailable).not.toHaveBeenCalled()
  })

  it('returns the current availability', () => {
    useLlamaStore.setState({ available: false })
    const { result } = renderHook(() => useLlamaAvailability(true))
    expect(result.current).toBe(false)
  })
})
