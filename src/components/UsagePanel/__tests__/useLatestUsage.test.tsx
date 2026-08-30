import { describe, it, expect, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useLatestUsage } from '../useLatestUsage'
import type { LatestUsage } from '@/types/api'

const SAMPLE: LatestUsage = {
  ts: Date.now(),
  sessionPct: 38,
  weeklyPct: 56,
  requests24h: 0,
  requests7d: 0,
  topSkills: [],
  sessionResetAt: null,
  weeklyResetAt: null,
  sessionAvgRatePerHour: null,
  weeklyAvgRatePerHour: null,
  sessionCutoffAt: null,
  weeklyCutoffAt: null,
  sessionSpendUsd: 0,
  weeklySpendUsd: 0,
  sessionSpendRatePerHour: null,
  weeklySpendRatePerHour: null,
}

function mockApi(overrides: Partial<typeof window.api> = {}) {
  Object.defineProperty(window, 'api', {
    value: {
      usageAcquire: vi.fn().mockResolvedValue(undefined),
      usageRelease: vi.fn().mockResolvedValue(undefined),
      usageGetLatest: vi.fn().mockResolvedValue(null),
      onUsageUpdate: vi.fn().mockReturnValue(() => {}),
      ...overrides,
    },
    writable: true,
    configurable: true,
  })
}

describe('useLatestUsage', () => {
  it('acquires the usage source on mount and releases it on unmount', () => {
    mockApi()
    const { unmount } = renderHook(() => useLatestUsage())

    expect(window.api.usageAcquire).toHaveBeenCalledTimes(1)
    unmount()
    expect(window.api.usageRelease).toHaveBeenCalledTimes(1)
  })

  it('returns null until the initial fetch resolves, then the fetched data', async () => {
    mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
    const { result } = renderHook(() => useLatestUsage())

    await waitFor(() => expect(result.current).toEqual(SAMPLE))
  })

  it('updates when a push update arrives via onUsageUpdate', async () => {
    let pushUpdate: (data: LatestUsage | null) => void = () => {}
    mockApi({
      onUsageUpdate: vi.fn().mockImplementation((cb: (data: LatestUsage | null) => void) => {
        pushUpdate = cb
        return () => {}
      }),
    })
    const { result } = renderHook(() => useLatestUsage())
    expect(result.current).toBeNull()

    act(() => pushUpdate(SAMPLE))

    await waitFor(() => expect(result.current).toEqual(SAMPLE))
  })
})
