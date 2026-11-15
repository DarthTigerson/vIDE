import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { CostPanel } from '@/components/UsagePanel/CostPanel'
import type { LatestUsage } from '@/types/api'

const SAMPLE: LatestUsage = {
  ts: Date.now(),
  sessionPct: 50,
  weeklyPct: 41,
  requests24h: 0,
  requests7d: 0,
  topSkills: [],
  sessionResetAt: Date.now() + 2 * 3_600_000,
  weeklyResetAt: Date.now() + 86_400_000,
  sessionAvgRatePerHour: 10,
  weeklyAvgRatePerHour: 0.5,
  sessionCutoffAt: null,
  weeklyCutoffAt: null,
  sessionSpendUsd: 4.82,
  weeklySpendUsd: 38.2,
  sessionSpendRatePerHour: 1.35,
  weeklySpendRatePerHour: 0.45,
}

function mockApi(latest: LatestUsage | null) {
  Object.defineProperty(window, 'api', {
    value: {
      usageAcquire: vi.fn().mockResolvedValue(undefined),
      usageRelease: vi.fn().mockResolvedValue(undefined),
      usageGetLatest: vi.fn().mockResolvedValue(latest),
      onUsageUpdate: vi.fn().mockReturnValue(() => {}),
    },
    writable: true,
    configurable: true,
  })
}

describe('CostPanel', () => {
  beforeEach(() => mockApi(null))

  it('shows a placeholder before any data has arrived', () => {
    render(<CostPanel />)
    expect(screen.getByText('No usage data yet')).toBeTruthy()
  })

  it('shows session spend marked as an estimate, with rate and reset countdown', async () => {
    mockApi(SAMPLE)
    render(<CostPanel />)

    await waitFor(() => expect(screen.getByText('$4.82')).toBeTruthy())
    expect(screen.getByText('Estimate')).toBeTruthy()
    expect(screen.getByText('≈$1.35/hr')).toBeTruthy()
    expect(screen.getByText(/^1h \d+m$/)).toBeTruthy()
  })

  it('projects spend at reset from the current rate', async () => {
    mockApi(SAMPLE)
    render(<CostPanel />)

    // 4.82 + 1.35 * ~2h ≈ 7.52
    await waitFor(() => expect(screen.getByTestId('cost-projection').textContent).toMatch(/^≈\$7\.5\d at reset$/))
  })

  it('omits the projection without a spend rate', async () => {
    mockApi({ ...SAMPLE, sessionSpendRatePerHour: null })
    render(<CostPanel />)

    await waitFor(() => expect(screen.getByText('$4.82')).toBeTruthy())
    expect(screen.queryByTestId('cost-projection')).toBeNull()
  })
})
