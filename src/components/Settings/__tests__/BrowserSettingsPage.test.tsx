// src/components/Settings/__tests__/BrowserSettingsPage.test.tsx
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, vi } from 'vitest'

// Hoisted so window.api exists before any import runs: browserMcpStore has a
// module-load-time Promise.resolve().then(...) that calls window.api directly,
// and that microtask flushes during module collection — long before a
// beforeEach would.
vi.hoisted(() => {
  ;(global as any).window = (global as any).window ?? {}
  ;(global as any).window.api = {
    browserMcpEnable: () => Promise.resolve(),
    browserMcpDisable: () => Promise.resolve(),
    browserMcpSetEnabled: () => Promise.resolve(),
  }
})

import { render, screen, cleanup } from '@testing-library/react'
import { BrowserSettingsPage } from '../BrowserSettingsPage'
import { useBrowserSettingsStore } from '@/stores/browserSettingsStore'
import { useBrowserMcpStore } from '@/stores/browserMcpStore'

afterEach(() => {
  cleanup()
  useBrowserSettingsStore.setState({ openInBiggestPane: true })
  useBrowserMcpStore.setState({ enabled: false, pending: false, error: null })
})

describe('BrowserSettingsPage', () => {
  it('does not render a Default URL field', () => {
    render(<BrowserSettingsPage />)
    expect(screen.queryByLabelText('Default URL')).toBeNull()
    expect(screen.queryByText('Default URL')).toBeNull()
  })

  it('still renders the "Always open in biggest window" toggle', () => {
    render(<BrowserSettingsPage />)
    expect(screen.getByRole('switch', { name: 'Always open in biggest window' })).toBeTruthy()
  })
})
