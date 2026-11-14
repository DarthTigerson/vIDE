import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { NotificationBell } from '../NotificationBell'
import { useUsageAlertStore } from '@/stores/usageAlertStore'
import { useUpdateStore } from '@/stores/updateStore'
import { useDockerSettingsStore } from '@/stores/dockerSettingsStore'
import { useDockerStore } from '@/stores/dockerStore'
import { useNotificationPanelStore } from '@/stores/notificationPanelStore'
import { useNotificationAcknowledgedStore } from '@/stores/notificationAcknowledgedStore'
import { useNotificationArrivalStore } from '@/stores/notificationArrivalStore'

beforeEach(() => {
  useUsageAlertStore.setState({ alerts: [] })
  useUpdateStore.setState({ available: null, status: 'idle' })
  useDockerSettingsStore.setState({ enabled: false })
  useDockerStore.setState({ status: 'unknown' })
  useNotificationPanelStore.setState({ open: false })
  useNotificationAcknowledgedStore.setState({ acknowledgedIds: [], dismissedIds: [] })
  useNotificationArrivalStore.setState({ knownIds: [], arrival: null })
})

afterEach(() => {
  cleanup()
})

const twoActive = () => {
  useUsageAlertStore.setState({ alerts: [{ scope: 'session', cutoffAt: Date.now() + 60_000, resetAt: null }] })
  useDockerSettingsStore.setState({ enabled: true })
  useDockerStore.setState({ status: 'stopped' })
}

describe('NotificationBell', () => {
  it('is shown at every width — no breakpoint hiding', () => {
    render(<NotificationBell />)
    expect(screen.getByTestId('notification-bell').className).not.toMatch(/min-\[1200px\]/)
  })

  it('is a muted, disabled bell with no count when nothing is active', () => {
    render(<NotificationBell />)
    const bell = screen.getByTestId('notification-bell')
    expect(bell).toBeDisabled()
    expect(bell.className).toMatch(/text-fg-subtle/)
    expect(bell.textContent).toBe('')
    fireEvent.mouseUp(bell, { button: 0 })
    expect(useNotificationPanelStore.getState().open).toBe(false)
  })

  it('shows the count inside the same pill, filled while unread', () => {
    twoActive()
    render(<NotificationBell />)
    const bell = screen.getByTestId('notification-bell')
    expect(bell.textContent).toBe('2')
    expect(bell).toHaveAccessibleName('2 notifications')
    expect(bell.className).toMatch(/bg-accent/)
  })

  it('switches to an outline once everything has been acknowledged, keeping the count', () => {
    twoActive()
    render(<NotificationBell />)
    act(() => {
      useNotificationAcknowledgedStore.getState().acknowledge(['usage-session', 'docker'])
    })
    const bell = screen.getByTestId('notification-bell')
    expect(bell.textContent).toBe('2')
    expect(bell.className).not.toMatch(/bg-accent/)
    expect(bell.className).toMatch(/text-fg-muted/)
  })

  it('toggles the panel on mouseup (VIDE-91)', () => {
    twoActive()
    render(<NotificationBell />)
    fireEvent.mouseUp(screen.getByTestId('notification-bell'), { button: 0 })
    expect(useNotificationPanelStore.getState().open).toBe(true)
    fireEvent.mouseUp(screen.getByTestId('notification-bell'), { button: 0 })
    expect(useNotificationPanelStore.getState().open).toBe(false)
  })

  it('rings when a new notification arrives', () => {
    render(<NotificationBell />)
    expect(screen.getByTestId('notification-bell').querySelector('.notification-bell-ring')).toBeNull()
    act(() => twoActive())
    expect(screen.getByTestId('notification-bell').querySelector('.notification-bell-ring')).not.toBeNull()
  })
})
