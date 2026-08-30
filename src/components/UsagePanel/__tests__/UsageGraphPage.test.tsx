import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
  it('renders a "no usage data yet" empty state before data has arrived', () => {
    mockApi()
    render(<UsageGraphPage />)

    expect(screen.getByText('No usage data yet')).toBeTruthy()
  })

  it('renders the full dashboard once data resolves: gauges, requests, burn rate, both charts, and top skills', async () => {
    mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
    render(<UsageGraphPage />)

    await waitFor(() => expect(screen.getByText('Session usage')).toBeTruthy())
    expect(screen.getByText('Weekly usage')).toBeTruthy()
    expect(screen.getByText('38%')).toBeTruthy()
    expect(screen.getByText('56%')).toBeTruthy()
    expect(screen.getByText('1,877')).toBeTruthy()
    expect(screen.getByText('4,336')).toBeTruthy()
    expect(screen.getByText('≈30.55%/hr')).toBeTruthy()
    expect(screen.getByText('Est. run out')).toBeTruthy()
    expect(screen.getByText('Top skills')).toBeTruthy()
    expect(screen.getByText('run')).toBeTruthy()
    expect(screen.getByText('12%')).toBeTruthy()
  })
})
