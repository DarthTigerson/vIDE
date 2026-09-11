import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { NotificationCompactToggle } from '../NotificationCompactToggle'
import { useUsageAlertStore } from '@/stores/usageAlertStore'
import { useUpdateStore } from '@/stores/updateStore'
import { useDockerSettingsStore } from '@/stores/dockerSettingsStore'
import { useDockerStore } from '@/stores/dockerStore'
import { useNotificationPanelStore } from '@/stores/notificationPanelStore'

beforeEach(() => {
  useUsageAlertStore.setState({ alerts: [] })
  useUpdateStore.setState({ available: null, status: 'idle', upToDateVersion: null })
  useDockerSettingsStore.setState({ enabled: false })
  useDockerStore.setState({ status: 'unknown' })
  useNotificationPanelStore.setState({ open: false })
})

afterEach(() => {
  cleanup()
})

describe('NotificationCompactToggle', () => {
  it('always renders the bell, even with nothing active', () => {
    render(<NotificationCompactToggle />)
    const button = screen.getByTestId('notification-compact-toggle')
    expect(button).toBeInTheDocument()
    expect(button.className).toMatch(/min-\[1200px\]:hidden/)
  })

  it('is muted and does not open the panel when there is nothing active', () => {
    render(<NotificationCompactToggle />)
    const button = screen.getByTestId('notification-compact-toggle')
    expect(button.className).toMatch(/text-fg-subtle/)
    fireEvent.mouseUp(button, { button: 0 })
    expect(useNotificationPanelStore.getState().open).toBe(false)
  })

  it('shows the active color when a notification is active', () => {
    useUsageAlertStore.setState({ alerts: [{ scope: 'session', cutoffAt: Date.now() + 1000, resetAt: null }] })
    render(<NotificationCompactToggle />)
    expect(screen.getByTestId('notification-compact-toggle').className).toMatch(/text-accent/)
  })

  it('opens the panel on mouseup when a notification is active (VIDE-91)', () => {
    useUsageAlertStore.setState({ alerts: [{ scope: 'session', cutoffAt: Date.now() + 1000, resetAt: null }] })
    render(<NotificationCompactToggle />)
    fireEvent.mouseUp(screen.getByTestId('notification-compact-toggle'), { button: 0 })
    expect(useNotificationPanelStore.getState().open).toBe(true)
  })
})
