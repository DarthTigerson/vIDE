import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVisibleNotificationItems } from '../useVisibleNotificationItems'
import { useUsageAlertStore } from '@/stores/usageAlertStore'
import { useUpdateStore } from '@/stores/updateStore'
import { useDockerSettingsStore } from '@/stores/dockerSettingsStore'
import { useDockerStore } from '@/stores/dockerStore'
import { useNotificationAcknowledgedStore } from '@/stores/notificationAcknowledgedStore'

beforeEach(() => {
  useUsageAlertStore.setState({ alerts: [{ scope: 'session', cutoffAt: Date.now() + 1000, resetAt: null }] })
  useUpdateStore.setState({ available: null, status: 'idle', upToDateVersion: null })
  useDockerSettingsStore.setState({ enabled: false })
  useDockerStore.setState({ status: 'unknown' })
  useNotificationAcknowledgedStore.setState({ acknowledgedIds: [] })
})

afterEach(() => {
  useNotificationAcknowledgedStore.setState({ acknowledgedIds: [] })
})

describe('useVisibleNotificationItems', () => {
  it('shows an item that has not been acknowledged', () => {
    const { result } = renderHook(() => useVisibleNotificationItems())
    expect(result.current.map((i) => i.id)).toEqual(['usage-session'])
  })

  it('hides an item once it has been acknowledged', () => {
    act(() => {
      useNotificationAcknowledgedStore.getState().acknowledge(['usage-session'])
    })
    const { result } = renderHook(() => useVisibleNotificationItems())
    expect(result.current).toEqual([])
  })

  it('re-shows an item after it clears and re-triggers, even though it was acknowledged before', () => {
    act(() => {
      useNotificationAcknowledgedStore.getState().acknowledge(['usage-session'])
    })
    const { result, rerender } = renderHook(() => useVisibleNotificationItems())
    expect(result.current).toEqual([])

    // clears
    act(() => {
      useUsageAlertStore.setState({ alerts: [] })
    })
    rerender()
    expect(result.current).toEqual([])
    // reconcile should have dropped the stale acknowledgment now that it's inactive
    expect(useNotificationAcknowledgedStore.getState().acknowledgedIds).toEqual([])

    // re-triggers
    act(() => {
      useUsageAlertStore.setState({ alerts: [{ scope: 'session', cutoffAt: Date.now() + 1000, resetAt: null }] })
    })
    rerender()
    expect(result.current.map((i) => i.id)).toEqual(['usage-session'])
  })

  it('does not let an acknowledged id block an unrelated, unacknowledged one', () => {
    act(() => {
      useNotificationAcknowledgedStore.getState().acknowledge(['usage-session'])
      useDockerSettingsStore.setState({ enabled: true })
      useDockerStore.setState({ status: 'stopped' })
    })
    const { result } = renderHook(() => useVisibleNotificationItems())
    expect(result.current.map((i) => i.id)).toEqual(['docker'])
  })
})
