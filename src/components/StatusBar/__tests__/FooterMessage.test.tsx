import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { FooterMessage } from '../FooterMessage'
import { useUpdateStore } from '@/stores/updateStore'
import { useUsageAlertStore } from '@/stores/usageAlertStore'
import { useDisplayStore } from '@/stores/displayStore'
import { useEditorStore } from '@/stores/editorStore'
import { USAGE_GRAPH_TAB_PATH } from '@/components/Settings/paths'
import { FOOTER_TIPS } from '@/lib/footerTips'

beforeEach(() => {
  useUpdateStore.setState({ available: null, status: 'idle' })
  useUsageAlertStore.setState({ alert: null })
  useDisplayStore.setState({ footerContent: 'hints' })
})

afterEach(() => {
  cleanup()
  useUpdateStore.setState({ available: null, status: 'idle' })
  useUsageAlertStore.setState({ alert: null })
  useDisplayStore.setState({ footerContent: 'hints' })
})

describe('FooterMessage — tip rotation', () => {
  it('shows one of the known tips when no update is available', () => {
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

  it('an available update still overrides the clock, same as it overrides tips', () => {
    useDisplayStore.setState({ footerContent: 'clock' })
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com' }, status: 'idle' })
    render(<FooterMessage />)
    expect(screen.getByRole('button', { name: /vIDE v0\.2\.0 is available/ })).toBeInTheDocument()
    expect(screen.queryByText('2:32 PM')).toBeNull()
  })
})

describe('FooterMessage — usage alert', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 14, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a session usage alert with a live HH:MM:SS countdown and opens the Usage Graph tab on click', () => {
    useUsageAlertStore.setState({ alert: { scope: 'session', cutoffAt: new Date(2026, 0, 1, 16, 0, 0).getTime() } })
    render(<FooterMessage />)
    const button = screen.getByRole('button', { name: /Session usage may run out in 02:00:00/ })
    fireEvent.click(button)
    expect(useEditorStore.getState().activeTabPath).toBe(USAGE_GRAPH_TAB_PATH)
  })

  it('ticks the countdown down every second', () => {
    useUsageAlertStore.setState({ alert: { scope: 'session', cutoffAt: new Date(2026, 0, 1, 16, 0, 0).getTime() } })
    render(<FooterMessage />)
    expect(screen.getByRole('button', { name: /run out in 02:00:00/ })).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.getByRole('button', { name: /run out in 01:59:57/ })).toBeInTheDocument()
  })

  it('labels a weekly cutoff as "Weekly usage"', () => {
    useUsageAlertStore.setState({ alert: { scope: 'week', cutoffAt: new Date(2026, 0, 1, 16, 0, 0).getTime() } })
    render(<FooterMessage />)
    expect(screen.getByRole('button', { name: /Weekly usage may run out/ })).toBeInTheDocument()
  })

  it('takes priority over an available update', () => {
    useUsageAlertStore.setState({ alert: { scope: 'session', cutoffAt: new Date(2026, 0, 1, 16, 0, 0).getTime() } })
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com' }, status: 'idle' })
    render(<FooterMessage />)
    expect(screen.getByRole('button', { name: /Session usage may run out/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /vIDE v0\.2\.0 is available/ })).not.toBeInTheDocument()
  })
})

describe('FooterMessage — update override', () => {
  it('shows an update-available message and starts the update on click', () => {
    const startUpdate = vi.fn()
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com' }, status: 'idle', startUpdate })
    render(<FooterMessage />)
    const button = screen.getByRole('button', { name: /vIDE v0\.2\.0 is available/ })
    fireEvent.click(button)
    expect(startUpdate).toHaveBeenCalled()
  })

  it('shows an updating message that is not clickable', () => {
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com' }, status: 'updating' })
    render(<FooterMessage />)
    const button = screen.getByRole('button', { name: /Updating vIDE/ })
    expect(button).toBeDisabled()
  })

  it('shows a restart message and restarts on click when ready', () => {
    const restart = vi.fn()
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com' }, status: 'ready', restart })
    render(<FooterMessage />)
    const button = screen.getByRole('button', { name: /click to restart/ })
    fireEvent.click(button)
    expect(restart).toHaveBeenCalled()
  })

  it('shows a retry message and starts the update again when failed', () => {
    const startUpdate = vi.fn()
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com' }, status: 'failed', startUpdate })
    render(<FooterMessage />)
    const button = screen.getByRole('button', { name: /Update failed/ })
    fireEvent.click(button)
    expect(startUpdate).toHaveBeenCalled()
  })
})
