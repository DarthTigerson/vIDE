import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    localStorage.removeItem('vide:usagePanelView')
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

  describe('Gauges view (default)', () => {
    it('shows a speedometer for session and a fuel gauge for week, with chips and footers', async () => {
      mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
      render(<UsagePanel />)

      await waitFor(() => expect(screen.getByTestId('usage-gauges')).toBeTruthy())
      expect(screen.getByTestId('usage-panel')).toHaveAttribute('data-view', 'gauges')
      expect(screen.getByText('38%')).toBeTruthy()
      expect(screen.getByText('56%')).toBeTruthy()
      expect(screen.getByText('≈30.55%/hr')).toBeTruthy()
      expect(screen.getByText('≈0.73%/hr')).toBeTruthy()
      expect(screen.getByText('Under pace · 69% at reset')).toBeTruthy()
      expect(screen.getAllByTestId('gauge-now')).toHaveLength(2)
      expect(screen.getByTestId('gauge-week').textContent).toMatch(/E.*F/)
      expect(screen.getByTestId('fuel-light')).toHaveAttribute('data-out', 'false')
    })

    it('lights the fuel warning red when a limit is reached', async () => {
      mockApi({ usageGetLatest: vi.fn().mockResolvedValue({ ...SAMPLE, weeklyPct: 100 }) })
      render(<UsagePanel />)

      await waitFor(() => expect(screen.getByTestId('fuel-light')).toHaveAttribute('data-out', 'true'))
      expect(screen.getByTestId('fuel-light').textContent).toContain('Out of usage: week limit reached')
      expect(screen.getByText('Limit reached')).toBeTruthy()
    })

    it('switches to bars from the right-click menu and remembers it', async () => {
      mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
      const { unmount } = render(<UsagePanel />)
      await waitFor(() => expect(screen.getByTestId('usage-gauges')).toBeTruthy())

      fireEvent.contextMenu(screen.getByTestId('usage-panel'))
      fireEvent.click(screen.getByText('Bars'))
      expect(screen.getByTestId('usage-panel')).toHaveAttribute('data-view', 'bars')
      expect(screen.getAllByTestId('pace-now')).toHaveLength(2)
      expect(screen.queryByRole('menu')).toBeNull()
      expect(localStorage.getItem('vide:usagePanelView')).toBe('bars')

      unmount()
      render(<UsagePanel />)
      await waitFor(() => expect(screen.getAllByTestId('pace-now')).toHaveLength(2))
    })
  })

  describe('Bars view', () => {
    beforeEach(() => {
      localStorage.setItem('vide:usagePanelView', 'bars')
    })

    it('renders a pace bar per window with percent, burn rate and countdown', async () => {
      mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
      render(<UsagePanel />)

      await waitFor(() => expect(screen.getByText('38%')).toBeTruthy())
      expect(screen.getByText('56%')).toBeTruthy()
      expect(screen.getByText('Session')).toBeTruthy()
      expect(screen.getByText('Week')).toBeTruthy()
      expect(screen.getByText('≈30.55%/hr')).toBeTruthy()
      expect(screen.getByText('≈0.73%/hr')).toBeTruthy()
      expect(screen.getAllByTestId('pace-now')).toHaveLength(2)
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

    it('shows a runs-out chip with a countdown when a cutoff is predicted', async () => {
      mockApi({ usageGetLatest: vi.fn().mockResolvedValue({ ...SAMPLE, sessionCutoffAt: Date.now() + 2 * 3_600_000 + 5 * 60_000 }) })
      render(<UsagePanel />)

      await waitFor(() => expect(screen.getByText(/^Runs out in \d+h \d+m$/)).toBeTruthy())
    })

    it('shows pace and projected-at-reset when there is no cutoff', async () => {
      mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
      render(<UsagePanel />)

      await waitFor(() => expect(screen.getByText('38%')).toBeTruthy())
      // Session: 1h left of 5h → 80% elapsed, 38% used → under pace; 38 + 30.55 ≈ 69% at reset.
      expect(screen.getByText('Under pace · 69% at reset')).toBeTruthy()
      expect(screen.getAllByTestId('pace-chip')).toHaveLength(2)
    })

    it('wraps rather than clipping when the panel narrows', async () => {
      mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
      const { container } = render(<UsagePanel />)
      await waitFor(() => expect(screen.getByText('38%')).toBeTruthy())

      expect(container.firstElementChild?.className ?? '').not.toMatch(/overflow-x-hidden/)
      expect(container.querySelectorAll('.flex-wrap').length).toBeGreaterThan(0)
    })

    it('names each part of the bar in a pill on hover', async () => {
      mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
      render(<UsagePanel />)
      await waitFor(() => expect(screen.getByText('38%')).toBeTruthy())

      // Session: 38% used, 1h left of 5h → 80% elapsed, 38 + 30.55 ≈ 69% at reset, 31% remaining.
      const bar = screen.getByRole('img', { name: 'Session 38% used' })
      const tipText = () => screen.getByTestId('pace-tip').textContent
      const part = (id: string) => bar.querySelector(`[data-testid="${id}"]`) as HTMLElement

      fireEvent.mouseEnter(part('pace-used'))
      expect(tipText()).toBe('Used38%')
      fireEvent.mouseEnter(part('pace-projection'))
      expect(tipText()).toBe('Projected at reset69%')
      fireEvent.mouseEnter(part('pace-now'))
      expect(tipText()).toBe('Time elapsed80%')
      fireEvent.mouseEnter(part('pace-remaining'))
      expect(tipText()).toBe('Remaining31%')

      fireEvent.mouseLeave(bar)
      expect(screen.queryByTestId('pace-tip')).toBeNull()
    })
  })
})
