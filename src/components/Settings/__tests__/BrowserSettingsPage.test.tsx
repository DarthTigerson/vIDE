// src/components/Settings/__tests__/BrowserSettingsPage.test.tsx
/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BrowserSettingsPage } from '../BrowserSettingsPage'
import { useBrowserSettingsStore } from '@/stores/browserSettingsStore'
import { useBrowserMcpStore } from '@/stores/browserMcpStore'

beforeEach(() => {
  ;(global as any).window = (global as any).window ?? {}
  ;(global as any).window.api = { browserMcpSetEnabled: () => Promise.resolve() }
})

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
