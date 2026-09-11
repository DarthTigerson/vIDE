import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { FooterMessage } from '../FooterMessage'
import { useUpdateStore } from '@/stores/updateStore'
import { useUsageAlertStore } from '@/stores/usageAlertStore'
import { useDisplayStore } from '@/stores/displayStore'
import { useDockerSettingsStore } from '@/stores/dockerSettingsStore'
import { useDockerStore } from '@/stores/dockerStore'
import { useNotificationPanelStore } from '@/stores/notificationPanelStore'
import { useNotificationAcknowledgedStore } from '@/stores/notificationAcknowledgedStore'
import { FOOTER_TIPS } from '@/lib/footerTips'

beforeEach(() => {
  useUpdateStore.setState({ available: null, status: 'idle', upToDateVersion: null })
  useUsageAlertStore.setState({ alert: null })
  useDisplayStore.setState({ footerContent: 'hints' })
  useDockerSettingsStore.setState({ enabled: false })
  useDockerStore.setState({ status: 'unknown' })
  useNotificationPanelStore.setState({ open: false })
  useNotificationAcknowledgedStore.setState({ acknowledgedIds: [] })
})

afterEach(() => {
  cleanup()
  useUpdateStore.setState({ available: null, status: 'idle', upToDateVersion: null })
  useUsageAlertStore.setState({ alert: null })
  useDisplayStore.setState({ footerContent: 'hints' })
  useDockerSettingsStore.setState({ enabled: false })
  useDockerStore.setState({ status: 'unknown' })
  useNotificationPanelStore.setState({ open: false })
  useNotificationAcknowledgedStore.setState({ acknowledgedIds: [] })
})

describe('FooterMessage — tip rotation', () => {
  it('shows one of the known tips when nothing is pending', () => {
    render(<FooterMessage />)
    const text = screen.getByText((content) => FOOTER_TIPS.includes(content))
    expect(text).toBeTruthy()
  })
})

describe('FooterMessage — footer content setting', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 14, 32, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the clock instead of a tip when footerContent is "clock"', () => {
    useDisplayStore.setState({ footerContent: 'clock' })
    render(<FooterMessage />)
    expect(screen.getByText('2:32 PM')).toBeInTheDocument()
    expect(screen.queryByText((content) => FOOTER_TIPS.includes(content))).toBeNull()
  })

  it('an active notification still overrides the clock, same as it overrides tips', () => {
    useDisplayStore.setState({ footerContent: 'clock' })
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com' }, status: 'idle' })
    render(<FooterMessage />)
    expect(screen.getByRole('button', { name: /vIDE v0\.2\.0 is available/ })).toBeInTheDocument()
    expect(screen.queryByText('2:32 PM')).toBeNull()
  })
})

describe('FooterMessage — notification teaser', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 14, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the top-priority notification text and opens the panel on mouseup (not click — see VIDE-91)', () => {
    useUsageAlertStore.setState({ alert: { scope: 'session', cutoffAt: new Date(2026, 0, 1, 16, 0, 0).getTime(), resetAt: null } })
    render(<FooterMessage />)
    const button = screen.getByRole('button', { name: /Session usage may run out in 02:00:00/ })
    fireEvent.mouseUp(button, { button: 0 })
    expect(useNotificationPanelStore.getState().open).toBe(true)
  })

  it('ignores a non-primary mouse button release', () => {
    useUsageAlertStore.setState({ alert: { scope: 'session', cutoffAt: new Date(2026, 0, 1, 16, 0, 0).getTime(), resetAt: null } })
    render(<FooterMessage />)
    const button = screen.getByRole('button', { name: /Session usage may run out in 02:00:00/ })
    fireEvent.mouseUp(button, { button: 2 })
    expect(useNotificationPanelStore.getState().open).toBe(false)
  })

  it('ticks the countdown down every second', () => {
    useUsageAlertStore.setState({ alert: { scope: 'session', cutoffAt: new Date(2026, 0, 1, 16, 0, 0).getTime(), resetAt: null } })
    render(<FooterMessage />)
    expect(screen.getByRole('button', { name: /run out in 02:00:00/ })).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByRole('button', { name: /run out in 01:59:57/ })).toBeInTheDocument()
  })

  it('prioritizes the usage alert over an available update in the teaser', () => {
    useUsageAlertStore.setState({ alert: { scope: 'session', cutoffAt: new Date(2026, 0, 1, 16, 0, 0).getTime(), resetAt: null } })
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com' }, status: 'idle' })
    render(<FooterMessage />)
    expect(screen.getByRole('button', { name: /Session usage may run out/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /vIDE v0\.2\.0 is available/ })).not.toBeInTheDocument()
  })

  it('prioritizes Docker being off over an available update in the teaser', () => {
    useDockerSettingsStore.setState({ enabled: true })
    useDockerStore.setState({ status: 'stopped' })
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com' }, status: 'idle' })
    render(<FooterMessage />)
    expect(screen.getByRole('button', { name: "Docker isn't running" })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /vIDE v0\.2\.0 is available/ })).not.toBeInTheDocument()
  })

  it('shows the update-available text when it is the only active notification', () => {
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com' }, status: 'idle' })
    render(<FooterMessage />)
    expect(screen.getByRole('button', { name: /vIDE v0\.2\.0 is available/ })).toBeInTheDocument()
  })

  it('is silent about Docker when disabled in settings, even if stopped', () => {
    useDockerSettingsStore.setState({ enabled: false })
    useDockerStore.setState({ status: 'stopped' })
    render(<FooterMessage />)
    expect(screen.queryByText("Docker isn't running")).toBeNull()
  })

  it('stays a clickable toggle showing hints once acknowledged, even though the notification is still active', () => {
    useUsageAlertStore.setState({ alert: { scope: 'session', cutoffAt: new Date(2026, 0, 1, 16, 0, 0).getTime(), resetAt: null } })
    act(() => {
      useNotificationAcknowledgedStore.getState().acknowledge(['usage'])
    })
    render(<FooterMessage />)
    expect(screen.queryByText(/Session usage may run out/)).toBeNull()
    const teaser = screen.getByTestId('notification-teaser')
    expect(teaser.tagName).toBe('BUTTON')
    expect(screen.getByText((content) => FOOTER_TIPS.includes(content))).toBeInTheDocument()
  })
})

describe('FooterMessage — up to date confirmation', () => {
  it('shows the up-to-date confirmation, bypassing the notification panel entirely', () => {
    useUpdateStore.setState({ upToDateVersion: '0.2.11' })
    render(<FooterMessage />)
    expect(screen.getByText("You're on the latest version — v0.2.11")).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
