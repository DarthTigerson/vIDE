import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { UsagePanel } from '@/components/UsagePanel/UsagePanel'
import type { LatestUsage } from '@/types/api'

const SAMPLE: LatestUsage = {
  ts: Date.now(),
  sessionPct: 38,
  weeklyPct: 56,
  requests24h: 1877,
  requests7d: 4336,
  topSkills: [],
  sessionResetAt: Date.now() + 3_600_000,
  weeklyResetAt: Date.now() + 86_400_000,
  sessionAvgRatePerHour: 30.55,
  weeklyAvgRatePerHour: 0.73,
  sessionCutoffAt: null,
  weeklyCutoffAt: null,
  sessionSpendUsd: 1.42,
  weeklySpendUsd: 8.9,
  sessionSpendRatePerHour: 0.5,
  weeklySpendRatePerHour: 0.1,
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

describe('UsagePanel', () => {
  beforeEach(() => {
    mockApi()
  })

  it('acquires the usage source on mount', () => {
    render(<UsagePanel />)
    expect(window.api.usageAcquire).toHaveBeenCalledTimes(1)
  })

  it('releases the usage source on unmount', () => {
    const { unmount } = render(<UsagePanel />)
    unmount()
    expect(window.api.usageRelease).toHaveBeenCalledTimes(1)
  })

  it('shows a placeholder before any data has arrived', () => {
    render(<UsagePanel />)
    expect(screen.getByText('No usage data yet')).toBeTruthy()
  })

  it('renders gauges, burn-rate, and est. run out together once data resolves', async () => {
    mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
    render(<UsagePanel />)

    await waitFor(() => expect(screen.getByText('38%')).toBeTruthy())
    expect(screen.getByText('56%')).toBeTruthy()
    expect(screen.getByText('SESSION')).toBeTruthy()
    expect(screen.getByText('THIS WEEK')).toBeTruthy()
    expect(screen.getByText('≈30.55%/hr')).toBeTruthy()
    expect(screen.getByText('≈0.73%/hr')).toBeTruthy()
    expect(screen.getByText('Est. run out')).toBeTruthy()
  })

  it('re-renders when a push update arrives', async () => {
    let pushUpdate: (data: LatestUsage | null) => void = () => {}
    mockApi({
      onUsageUpdate: vi.fn().mockImplementation((cb: (data: LatestUsage | null) => void) => {
        pushUpdate = cb
        return () => {}
      }),
    })
    render(<UsagePanel />)
    expect(screen.getByText('No usage data yet')).toBeTruthy()

    act(() => pushUpdate(SAMPLE))

    await waitFor(() => expect(screen.getByText('38%')).toBeTruthy())
  })

  it('shows an estimated run-out date/time with an hours-and-minutes countdown underneath', async () => {
    const cutoffAt = new Date(2026, 7, 13, 9, 59).getTime()
    mockApi({ usageGetLatest: vi.fn().mockResolvedValue({ ...SAMPLE, sessionCutoffAt: cutoffAt }) })
    render(<UsagePanel />)

    await waitFor(() => expect(screen.getByText('Est. run out')).toBeTruthy())
    expect(screen.getByText(/Aug 13, 9:59/)).toBeTruthy()
    expect(screen.getByText(/^\d+h \d+m$/)).toBeTruthy()
  })

  it('shows "on track" for the run-out stat when there is no cutoff', async () => {
    mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
    render(<UsagePanel />)

    await waitFor(() => expect(screen.getByText('38%')).toBeTruthy())
    expect(screen.getAllByText('on track')).toHaveLength(2)
  })

  it('keeps the Est. run out column visible regardless of panel width', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 300 })

    try {
      mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
      render(<UsagePanel />)

      await waitFor(() => expect(screen.getByText('Est. run out')).toBeTruthy())
    } finally {
      if (originalDescriptor) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalDescriptor)
    }
  })
})
