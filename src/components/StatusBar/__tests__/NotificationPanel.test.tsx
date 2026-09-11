import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { NotificationPanel } from '../NotificationPanel'
import { useNotificationPanelStore } from '@/stores/notificationPanelStore'
import { useUsageAlertStore } from '@/stores/usageAlertStore'
import { useUpdateStore } from '@/stores/updateStore'
import { useDockerSettingsStore } from '@/stores/dockerSettingsStore'
import { useDockerStore } from '@/stores/dockerStore'
import { useEditorStore } from '@/stores/editorStore'
import { USAGE_GRAPH_TAB_PATH } from '@/components/Settings/paths'

beforeEach(() => {
  useNotificationPanelStore.setState({ open: true })
  useUsageAlertStore.setState({ alert: { scope: 'session', cutoffAt: Date.now() + 1000, resetAt: null } })
  useUpdateStore.setState({ available: null, status: 'idle', upToDateVersion: null })
  useDockerSettingsStore.setState({ enabled: false })
  useDockerStore.setState({ status: 'unknown' })
  useEditorStore.setState({ activeTabPath: null })
})

afterEach(() => {
  cleanup()
})

describe('NotificationPanel', () => {
  it('lists the active notifications when open', () => {
    render(<NotificationPanel />)
    expect(screen.getByText(/Session usage may run out/)).toBeInTheDocument()
  })

  it('is faded out and non-interactive when closed', () => {
    useNotificationPanelStore.setState({ open: false })
    render(<NotificationPanel />)
    const className = screen.getByTestId('notification-panel').className
    expect(className).toMatch(/opacity-0/)
    expect(className).toMatch(/pointer-events-none/)
  })

  it('is fully visible when open', () => {
    render(<NotificationPanel />)
    const className = screen.getByTestId('notification-panel').className
    expect(className).toMatch(/opacity-100/)
    expect(className).not.toMatch(/pointer-events-none/)
  })

  it('runs the row action and closes on row mouseup (not click — see VIDE-91)', () => {
    render(<NotificationPanel />)
    fireEvent.mouseUp(screen.getByText(/Session usage may run out/), { button: 0 })
    expect(useEditorStore.getState().activeTabPath).toBe(USAGE_GRAPH_TAB_PATH)
    expect(useNotificationPanelStore.getState().open).toBe(false)
  })

  it('closes on an outside mousedown without running any action', () => {
    render(<NotificationPanel />)
    fireEvent.mouseDown(document.body)
    expect(useNotificationPanelStore.getState().open).toBe(false)
    expect(useEditorStore.getState().activeTabPath).not.toBe(USAGE_GRAPH_TAB_PATH)
  })

  it('does not close on a mousedown inside the panel that misses a row', () => {
    render(<NotificationPanel />)
    fireEvent.mouseDown(screen.getByTestId('notification-panel'))
    expect(useNotificationPanelStore.getState().open).toBe(true)
  })

  it('closes on Escape', () => {
    render(<NotificationPanel />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useNotificationPanelStore.getState().open).toBe(false)
  })

  it('closes itself if the last notification clears while open', () => {
    render(<NotificationPanel />)
    act(() => {
      useUsageAlertStore.setState({ alert: null })
    })
    expect(useNotificationPanelStore.getState().open).toBe(false)
  })
})

describe('NotificationPanel — row buttons are removed from the DOM once closed', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps rows mounted through the close transition, then removes them — so a closed panel can never intercept a click', () => {
    vi.useFakeTimers()
    render(<NotificationPanel />)
    expect(screen.getByText(/Session usage may run out/)).toBeInTheDocument()

    act(() => {
      useNotificationPanelStore.getState().close()
    })
    // still present mid-fade, so the closing animation has something to animate
    expect(screen.getByText(/Session usage may run out/)).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.queryByText(/Session usage may run out/)).toBeNull()
  })
})
