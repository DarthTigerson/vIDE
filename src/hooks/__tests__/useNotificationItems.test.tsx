import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNotificationItems } from '../useNotificationItems'
import { useUsageAlertStore } from '@/stores/usageAlertStore'
import { useUpdateStore } from '@/stores/updateStore'
import { useDockerSettingsStore } from '@/stores/dockerSettingsStore'
import { useDockerStore } from '@/stores/dockerStore'
import { useDockerOffAlertStore } from '@/stores/dockerOffAlertStore'

beforeEach(() => {
  useUsageAlertStore.setState({ alerts: [] })
  useUpdateStore.setState({ available: null, status: 'idle', upToDateVersion: null })
  useDockerSettingsStore.setState({ enabled: false })
  useDockerStore.setState({ status: 'unknown' })
  useDockerOffAlertStore.setState({ openRequest: 0 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useNotificationItems', () => {
  it('returns an empty list when nothing is active', () => {
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current).toEqual([])
  })

  it('includes a session usage item projected to run out, with a live countdown to the cutoff', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 14, 0, 0))
    useUsageAlertStore.setState({
      alerts: [{ scope: 'session', cutoffAt: new Date(2026, 0, 1, 16, 0, 0).getTime(), resetAt: null }],
    })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current).toHaveLength(1)
    expect(result.current[0].id).toBe('usage-session')
    expect(result.current[0].text).toBe('Session usage may run out in 02:00:00')
    expect(result.current[0].icon).toBeTruthy()
  })

  it('labels a weekly cutoff as "Weekly usage"', () => {
    useUsageAlertStore.setState({ alerts: [{ scope: 'week', cutoffAt: Date.now() + 1000, resetAt: null }] })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current[0].id).toBe('usage-week')
    expect(result.current[0].text).toMatch(/^Weekly usage may run out/)
  })

  it('includes both session and weekly items when both windows are at risk', () => {
    useUsageAlertStore.setState({
      alerts: [
        { scope: 'week', cutoffAt: Date.now() + 1000, resetAt: null },
        { scope: 'session', cutoffAt: Date.now() + 5000, resetAt: null },
      ],
    })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current.map((i) => i.id)).toEqual(['usage-week', 'usage-session'])
  })

  it('switches to a reset countdown once the cutoff has actually passed', () => {
    vi.useFakeTimers()
    const now = new Date(2026, 0, 1, 14, 0, 0)
    vi.setSystemTime(now)
    useUsageAlertStore.setState({
      alerts: [{ scope: 'session', cutoffAt: now.getTime() - 1000, resetAt: new Date(2026, 0, 1, 18, 0, 0).getTime() }],
    })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current[0].text).toBe('Session usage ran out — resets in 04:00:00')
  })

  it('drops the reset countdown when no reset time is known', () => {
    vi.useFakeTimers()
    const now = new Date(2026, 0, 1, 14, 0, 0)
    vi.setSystemTime(now)
    useUsageAlertStore.setState({
      alerts: [{ scope: 'session', cutoffAt: now.getTime() - 1000, resetAt: null }],
    })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current[0].text).toBe('Session usage ran out')
  })

  it('is silent about Docker when disabled, even if stopped', () => {
    useDockerSettingsStore.setState({ enabled: false })
    useDockerStore.setState({ status: 'stopped' })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current.find((i) => i.id === 'docker')).toBeUndefined()
  })

  it('includes a Docker item when enabled but stopped, and its action requests the panel to open', () => {
    useDockerSettingsStore.setState({ enabled: true })
    useDockerStore.setState({ status: 'stopped' })
    const { result } = renderHook(() => useNotificationItems())
    const docker = result.current.find((i) => i.id === 'docker')
    expect(docker?.text).toBe("Docker isn't running")
    expect(docker?.icon).toBeTruthy()
    act(() => docker!.onClick!())
    expect(useDockerOffAlertStore.getState().openRequest).toBe(1)
  })

  it('includes an update-available item that starts the update on click', () => {
    const startUpdate = vi.fn()
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com' }, status: 'idle', startUpdate })
    const { result } = renderHook(() => useNotificationItems())
    const update = result.current.find((i) => i.id === 'update')
    expect(update?.text).toBe('vIDE v0.2.0 is available — click to update')
    expect(update?.icon).toBeTruthy()
    act(() => update!.onClick!())
    expect(startUpdate).toHaveBeenCalled()
  })

  it('marks the update item disabled with no action while an update is in progress', () => {
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com' }, status: 'updating' })
    const { result } = renderHook(() => useNotificationItems())
    const update = result.current.find((i) => i.id === 'update')
    expect(update?.disabled).toBe(true)
    expect(update?.onClick).toBeUndefined()
  })

  it('orders usage before docker before update', () => {
    useUsageAlertStore.setState({ alerts: [{ scope: 'session', cutoffAt: Date.now() + 1000, resetAt: null }] })
    useDockerSettingsStore.setState({ enabled: true })
    useDockerStore.setState({ status: 'stopped' })
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com' }, status: 'idle' })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current.map((i) => i.id)).toEqual(['usage-session', 'docker', 'update'])
  })
})
