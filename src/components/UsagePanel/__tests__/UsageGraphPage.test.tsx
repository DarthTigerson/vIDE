import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { UsageGraphPage } from '../UsageGraphPage'
import type { LatestUsage } from '@/types/api'

const SAMPLE: LatestUsage = {
  ts: Date.now(),
  sessionPct: 38,
  weeklyPct: 56,
  requests24h: 1877,
  requests7d: 4336,
  topSkills: [{ name: 'run', pct: 12 }],
  sessionResetAt: null,
  weeklyResetAt: null,
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
      usageGetRange: vi.fn().mockResolvedValue([]),
      onUsageUpdate: vi.fn().mockReturnValue(() => {}),
      ...overrides,
    },
    writable: true,
    configurable: true,
  })
}

describe('UsageGraphPage', () => {
  beforeEach(() => localStorage.clear())

  it('renders a "no usage data yet" empty state before data has arrived', () => {
    mockApi()
    render(<UsageGraphPage />)

    expect(screen.getByText('No usage data yet')).toBeTruthy()
  })

  it('renders the full dashboard once data resolves: pace bars, cost cards, requests, chart, and top skills', async () => {
    mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
    render(<UsageGraphPage />)

    await waitFor(() => expect(screen.getByText('Session & week usage')).toBeTruthy())
    expect(screen.getByText('38%')).toBeTruthy()
    expect(screen.getByText('56%')).toBeTruthy()
    expect(screen.getByText('≈30.55%/hr')).toBeTruthy()
    expect(screen.getByText('Session cost')).toBeTruthy()
    expect(screen.getByText('Week cost')).toBeTruthy()
    expect(screen.getByText('$1.42')).toBeTruthy()
    expect(screen.getByText('$8.90')).toBeTruthy()
    expect(screen.getByText('1,877')).toBeTruthy()
    expect(screen.getByText('4,336')).toBeTruthy()
    expect(screen.getByText('Top skills')).toBeTruthy()
    expect(screen.getByText('run')).toBeTruthy()
    expect(screen.getByText('12%')).toBeTruthy()
  })

  it('switches the chart between usage/cost and all/session/week, and remembers the choice', async () => {
    mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
    const { unmount } = render(<UsageGraphPage />)
    await waitFor(() => expect(screen.getByText('Session & week usage')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Cost' }))
    expect(screen.getByText('Session & week cost')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Week' }))
    expect(screen.getByText('Weekly cost')).toBeTruthy()

    unmount()
    render(<UsageGraphPage />)
    await waitFor(() => expect(screen.getByText('Weekly cost')).toBeTruthy())
  })

  it('keeps the picked range when switching between all, session and week', async () => {
    mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
    render(<UsageGraphPage />)
    await waitFor(() => expect(screen.getByText('Session & week usage')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: '1H' }))
    fireEvent.click(screen.getByRole('button', { name: 'Week' }))
    expect(screen.getByRole('button', { name: '1H' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Session' }))
    expect(screen.getByRole('button', { name: '1H' }).getAttribute('aria-pressed')).toBe('true')
  })
})
