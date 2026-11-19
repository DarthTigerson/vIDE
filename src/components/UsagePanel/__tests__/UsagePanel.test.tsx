import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { UsagePanel } from '@/components/UsagePanel/UsagePanel'
import type { LatestUsage } from '@/types/api'
import type { UsageViewProps } from '@/apps/videApiTypes'
import { useAppContribStore } from '@/apps/appContribStore'
import { useEditorStore } from '@/stores/editorStore'
import { useStoreStore } from '@/stores/storeStore'
import { buildAppSettingsPath } from '@/components/Settings/paths'

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

  describe('views', () => {
    const BikeGauge = vi.fn(({ session, week }: UsageViewProps) => (
      <div data-testid="bike-view">{session.label} {session.pct} / {week.label} {week.pct}</div>
    ))
    beforeEach(() => {
      BikeGauge.mockClear()
      useAppContribStore.setState({ usageViews: {}, settingsPages: {} })
    })
    const install = () =>
      useAppContribStore.setState({ usageViews: { 'bike-gauge': { appId: 'bike-gauge', title: 'Bike Gauge', component: BikeGauge } } })

    it('shows bars by default', async () => {
      mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
      render(<UsagePanel />)
      await waitFor(() => expect(screen.getAllByTestId('pace-now')).toHaveLength(2))
      expect(screen.getByTestId('usage-panel')).toHaveAttribute('data-view', 'bars')
    })

    it('renders an installed store view with the live windows, scoped to the app', async () => {
      install()
      localStorage.setItem('vide:usagePanelView', 'app:bike-gauge')
      mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
      render(<UsagePanel />)
      await waitFor(() => expect(screen.getByTestId('bike-view').textContent).toBe('Session 38 / Week 56'))
      expect(screen.getByTestId('usage-panel')).toHaveAttribute('data-view', 'app:bike-gauge')
      expect(screen.getByTestId('bike-view').closest('.vapp-bike-gauge')).not.toBeNull()
      const props = BikeGauge.mock.calls.at(-1)![0]
      expect(props.session).toMatchObject({ resetAt: SAMPLE.sessionResetAt, ratePerHour: 30.55, cutoffAt: null, windowHours: 5 })
      expect(props.week.windowHours).toBe(168)
    })

    it('falls back to bars when the saved view is not installed', async () => {
      localStorage.setItem('vide:usagePanelView', 'app:bike-gauge')
      mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
      render(<UsagePanel />)
      await waitFor(() => expect(screen.getAllByTestId('pace-now')).toHaveLength(2))
      expect(screen.getByTestId('usage-panel')).toHaveAttribute('data-view', 'bars')
    })

    it('lists Bars and installed views in the menu and remembers the pick', async () => {
      install()
      mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
      render(<UsagePanel />)
      await waitFor(() => expect(screen.getAllByTestId('pace-now')).toHaveLength(2))
      fireEvent.contextMenu(screen.getByTestId('usage-panel'))
      expect(screen.getByText('Bars')).toBeTruthy()
      fireEvent.click(screen.getByText('Bike Gauge'))
      expect(screen.getByTestId('bike-view')).toBeTruthy()
      expect(localStorage.getItem('vide:usagePanelView')).toBe('app:bike-gauge')
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('offers Preferences only when the active view has a settings page', async () => {
      install()
      const openTab = vi.fn()
      useEditorStore.setState({ openTab })
      mockApi({ usageGetLatest: vi.fn().mockResolvedValue(SAMPLE) })
      render(<UsagePanel />)
      await waitFor(() => expect(screen.getAllByTestId('pace-now')).toHaveLength(2))
      fireEvent.contextMenu(screen.getByTestId('usage-panel'))
      expect(screen.queryByText('Preferences…')).toBeNull()
      fireEvent.click(screen.getByText('Bike Gauge'))
      useAppContribStore.setState({ settingsPages: { 'bike-gauge': { appId: 'bike-gauge', title: 'Bike Gauge', component: () => null } } })
      fireEvent.contextMenu(screen.getByTestId('usage-panel'))
      fireEvent.click(screen.getByText('Preferences…'))
      expect(openTab).toHaveBeenCalledWith({ path: buildAppSettingsPath('bike-gauge'), content: '', dirty: false })
    })

    it('Store… opens the Store on the Usage category', async () => {
      const openWithCategory = vi.fn()
      useStoreStore.setState({ openWithCategory })
      render(<UsagePanel />)
      fireEvent.contextMenu(screen.getByTestId('usage-panel'))
      fireEvent.click(screen.getByText('Store…'))
      expect(openWithCategory).toHaveBeenCalledWith('usage')
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
