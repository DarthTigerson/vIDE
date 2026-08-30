import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, fireEvent } from '@testing-library/react'
import { UsageChart } from '../UsageChart'
import type { LatestUsage, UsageSnapshot } from '@/types/api'

const NOW = Date.now()

function usage(overrides: Partial<LatestUsage> = {}): LatestUsage {
  return {
    ts: NOW,
    sessionPct: 50,
    weeklyPct: 20,
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
    ...overrides,
  }
}

function snap(ts: number, pct: number): UsageSnapshot {
  return { ts, sessionPct: pct, weeklyPct: pct, requests24h: 0, requests7d: 0, topSkills: [], sessionResetAt: null, weeklyResetAt: null, sessionSpendUsd: 0, weeklySpendUsd: 0 }
}

function snapSpend(ts: number, usd: number): UsageSnapshot {
  return { ts, sessionPct: 0, weeklyPct: 0, requests24h: 0, requests7d: 0, topSkills: [], sessionResetAt: null, weeklyResetAt: null, sessionSpendUsd: usd, weeklySpendUsd: usd }
}

function mockApi(snapshots: UsageSnapshot[]) {
  Object.defineProperty(window, 'api', {
    value: { usageGetRange: vi.fn().mockResolvedValue(snapshots) },
    writable: true,
    configurable: true,
  })
}

// Every test starts from a clean slate — otherwise the range persistence
// tests below would leak a stored range into unrelated tests that assume
// each metric's own default (24h / 7d) is still in effect.
beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

describe('UsageChart — range persistence', () => {
  it('remembers the last range picked per metric across remounts', async () => {
    mockApi([snap(NOW - 604_800_000, 10), snap(NOW, 50)])
    const { getByRole, unmount } = render(<UsageChart latest={usage()} metric="session" />)
    await waitFor(() => expect(window.api.usageGetRange).toHaveBeenCalledTimes(1))

    fireEvent.click(getByRole('button', { name: '7D' }))
    await waitFor(() => expect(window.api.usageGetRange).toHaveBeenCalledTimes(2))
    unmount()

    render(<UsageChart latest={usage()} metric="session" />)
    await waitFor(() => expect(window.api.usageGetRange).toHaveBeenCalledTimes(3))
    const [from, to] = (window.api.usageGetRange as ReturnType<typeof vi.fn>).mock.calls[2]
    expect(to - from).toBe(604_800_000)
  })

  it('keeps session and weekly range preferences independent', async () => {
    mockApi([snap(NOW - 3_600_000, 10), snap(NOW, 50)])
    const { getByRole, unmount } = render(<UsageChart latest={usage()} metric="session" />)
    await waitFor(() => expect(window.api.usageGetRange).toHaveBeenCalledTimes(1))
    fireEvent.click(getByRole('button', { name: '1H' }))
    await waitFor(() => expect(window.api.usageGetRange).toHaveBeenCalledTimes(2))
    unmount()

    const { getByRole: getByRoleWeekly } = render(<UsageChart latest={usage()} metric="weekly" />)
    await waitFor(() => expect(getByRoleWeekly('button', { name: '7D' }).getAttribute('aria-pressed')).toBe('true'))
  })
})

describe('UsageChart (session metric)', () => {
  it('shows a placeholder before there is enough history', async () => {
    mockApi([])
    const { getByText, container } = render(<UsageChart latest={usage()} metric="session" />)
    await waitFor(() => expect(window.api.usageGetRange).toHaveBeenCalled())
    expect(getByText(/not enough history/i)).toBeTruthy()
    expect(container.querySelector('polyline')).toBeNull()
  })

  it('draws the session line and percent gridlines once history resolves', async () => {
    mockApi([snap(NOW - 3_600_000, 10), snap(NOW, 50)])
    const { container, getByText } = render(<UsageChart latest={usage()} metric="session" />)

    await waitFor(() => expect(container.querySelector('polyline')).toBeTruthy())
    expect(getByText('100%')).toBeTruthy()
    expect(getByText('0%')).toBeTruthy()
  })

  it('draws a dashed projection line to the session cutoff when it falls inside the visible window', async () => {
    mockApi([snap(NOW - 3_600_000, 10), snap(NOW, 50)])
    const cutoffAt = NOW + 60 * 60_000
    const { container } = render(<UsageChart latest={usage({ sessionCutoffAt: cutoffAt })} metric="session" />)

    await waitFor(() => expect(container.querySelector('polyline')).toBeTruthy())
    expect(container.querySelector('[data-testid="projection-line"]')).toBeTruthy()
  })

  it('defaults to the 24h range and requests history for a 24h window', async () => {
    mockApi([snap(NOW - 3_600_000, 10), snap(NOW, 50)])
    render(<UsageChart latest={usage()} metric="session" />)

    await waitFor(() => expect(window.api.usageGetRange).toHaveBeenCalled())
    const [from, to] = (window.api.usageGetRange as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(to - from).toBe(86_400_000)
  })

  it('re-requests history for the newly selected range when a range button is clicked', async () => {
    mockApi([snap(NOW - 3_600_000, 10), snap(NOW, 50)])
    const { getByRole } = render(<UsageChart latest={usage()} metric="session" />)
    await waitFor(() => expect(window.api.usageGetRange).toHaveBeenCalledTimes(1))

    fireEvent.click(getByRole('button', { name: '7D' }))

    await waitFor(() => expect(window.api.usageGetRange).toHaveBeenCalledTimes(2))
    const [from, to] = (window.api.usageGetRange as ReturnType<typeof vi.fn>).mock.calls[1]
    expect(to - from).toBe(604_800_000)
  })

  function realPolylines(container: HTMLElement) {
    return container.querySelectorAll('polyline:not([data-testid="gap-prediction-line"])')
  }

  it('renders a separate polyline for each side of a real data gap instead of one continuous line', async () => {
    // Two dense 1min-cadence clusters either side of a 6h gap — proportions
    // that mirror real polling data, so the gap clearly dominates the
    // series' mean spacing (see sparkline.test.ts for why this shape
    // matters: a lopsided cluster/gap ratio can hide a real gap).
    const before = Array.from({ length: 10 }, (_, i) => snap(NOW - 24 * 3_600_000 + i * 60_000, 10 + i))
    const gapStart = before[before.length - 1].ts + 6 * 3_600_000
    const after = Array.from({ length: 10 }, (_, i) => snap(gapStart + i * 60_000, 40 + i))
    mockApi([...before, ...after])
    const { container } = render(<UsageChart latest={usage()} metric="session" />)

    await waitFor(() => expect(realPolylines(container).length).toBe(2))
  })

  it('draws a dashed prediction across a real gap, held flat when the recorded reset deadline has not passed', async () => {
    const notYetPassed = NOW + 100 * 24 * 3_600_000 // well beyond the gap on both sides
    const before = Array.from({ length: 10 }, (_, i) => ({ ...snap(NOW - 24 * 3_600_000 + i * 60_000, 10 + i), sessionResetAt: notYetPassed }))
    const gapStart = before[before.length - 1].ts + 6 * 3_600_000
    const after = Array.from({ length: 10 }, (_, i) => ({ ...snap(gapStart + i * 60_000, 40 + i), sessionResetAt: notYetPassed }))
    mockApi([...before, ...after])
    const { container } = render(<UsageChart latest={usage()} metric="session" />)

    await waitFor(() => expect(container.querySelectorAll('[data-testid="gap-prediction-line"]').length).toBe(1))
  })

  it('draws two dashed predictions (drop to 0%, then climb) when the recorded reset deadline fell inside the gap', async () => {
    const before = Array.from({ length: 10 }, (_, i) => snap(NOW - 24 * 3_600_000 + i * 60_000, 10 + i))
    const gapStart = before[before.length - 1].ts + 6 * 3_600_000
    const resetAt = before[before.length - 1].ts + 3 * 3_600_000 // 3h into the 6h gap
    const beforeWithReset = before.map((s) => ({ ...s, sessionResetAt: resetAt }))
    const after = Array.from({ length: 10 }, (_, i) => ({ ...snap(gapStart + i * 60_000, 40 + i), sessionResetAt: resetAt + 5 * 24 * 3_600_000 }))
    mockApi([...beforeWithReset, ...after])
    const { container } = render(<UsageChart latest={usage()} metric="session" />)

    await waitFor(() => expect(container.querySelectorAll('[data-testid="gap-prediction-line"]').length).toBe(2))
  })

  it('shows a tooltip with the nearest snapshot on hover', async () => {
    mockApi([snap(NOW - 3_600_000, 10), snap(NOW, 50)])
    const { container } = render(<UsageChart latest={usage()} metric="session" />)
    await waitFor(() => expect(container.querySelector('polyline')).toBeTruthy())

    const plot = container.querySelector('[data-testid="chart-plot"]') as HTMLElement
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 200, width: 200, top: 0, bottom: 100, height: 100, x: 0, y: 0, toJSON: () => {},
    })
    fireEvent.pointerDown(plot, { clientX: 198 })

    await waitFor(() => expect(container.querySelector('[data-testid="chart-tooltip"]')).toBeTruthy())
    expect(container.querySelector('[data-testid="chart-tooltip"]')?.textContent).toMatch(/50% session/)
  })
})

describe('UsageChart (weekly metric)', () => {
  it('shows the "Weekly usage" title and defaults to the 7d range', async () => {
    mockApi([snap(NOW - 86_400_000, 10), snap(NOW, 50)])
    const { getByText, getByRole } = render(<UsageChart latest={usage()} metric="weekly" />)

    expect(getByText('Weekly usage')).toBeTruthy()
    await waitFor(() => expect(window.api.usageGetRange).toHaveBeenCalled())
    const [from, to] = (window.api.usageGetRange as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(to - from).toBe(604_800_000)
    expect(getByRole('button', { name: '7D' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('draws a dashed projection line to the weekly cutoff, independent of the session cutoff', async () => {
    mockApi([snap(NOW - 86_400_000, 10), snap(NOW, 50)])
    const cutoffAt = NOW + 24 * 60 * 60_000
    const { container } = render(
      <UsageChart latest={usage({ sessionCutoffAt: null, weeklyCutoffAt: cutoffAt })} metric="weekly" />
    )

    await waitFor(() => expect(container.querySelector('polyline')).toBeTruthy())
    expect(container.querySelector('[data-testid="projection-line"]')).toBeTruthy()
  })

  it('shows a tooltip labeled "week" using weeklyPct on hover', async () => {
    mockApi([snap(NOW - 86_400_000, 10), snap(NOW, 50)])
    const { container } = render(<UsageChart latest={usage()} metric="weekly" />)
    await waitFor(() => expect(container.querySelector('polyline')).toBeTruthy())

    const plot = container.querySelector('[data-testid="chart-plot"]') as HTMLElement
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 200, width: 200, top: 0, bottom: 100, height: 100, x: 0, y: 0, toJSON: () => {},
    })
    fireEvent.pointerDown(plot, { clientX: 198 })

    await waitFor(() => expect(container.querySelector('[data-testid="chart-tooltip"]')).toBeTruthy())
    expect(container.querySelector('[data-testid="chart-tooltip"]')?.textContent).toMatch(/50% week/)
  })
})

describe('UsageChart (sessionSpend metric)', () => {
  it('shows the "Session cost" title and $-formatted gridlines scaled to the visible data\'s own max', async () => {
    mockApi([snapSpend(NOW - 3_600_000, 1), snapSpend(NOW, 4)])
    const { getByText, container } = render(<UsageChart latest={usage()} metric="sessionSpend" />)

    expect(getByText('Session cost')).toBeTruthy()
    await waitFor(() => expect(container.querySelector('polyline')).toBeTruthy())
    // Max visible value is $4 -> the 100% gridline reads $4.00, not "100%".
    expect(getByText('$4.00')).toBeTruthy()
    expect(getByText('$0.00')).toBeTruthy()
  })

  it('never draws a projection line, even with a cutoff-shaped latest snapshot', async () => {
    mockApi([snapSpend(NOW - 3_600_000, 1), snapSpend(NOW, 4)])
    const { container } = render(
      <UsageChart latest={usage({ sessionCutoffAt: NOW + 3_600_000 })} metric="sessionSpend" />
    )

    await waitFor(() => expect(container.querySelector('polyline')).toBeTruthy())
    expect(container.querySelector('[data-testid="projection-line"]')).toBeNull()
  })

  it('shows a tooltip with the dollar amount, not a raw percent', async () => {
    mockApi([snapSpend(NOW - 3_600_000, 1), snapSpend(NOW, 4)])
    const { container } = render(<UsageChart latest={usage()} metric="sessionSpend" />)
    await waitFor(() => expect(container.querySelector('polyline')).toBeTruthy())

    const plot = container.querySelector('[data-testid="chart-plot"]') as HTMLElement
    vi.spyOn(plot, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 200, width: 200, top: 0, bottom: 100, height: 100, x: 0, y: 0, toJSON: () => {},
    })
    fireEvent.pointerDown(plot, { clientX: 198 })

    await waitFor(() => expect(container.querySelector('[data-testid="chart-tooltip"]')).toBeTruthy())
    expect(container.querySelector('[data-testid="chart-tooltip"]')?.textContent).toMatch(/\$4\.00 session/)
  })
})
