import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SyncStatusPill } from '../SyncStatusPill'

afterEach(cleanup)

// SYNC-19: pill renders the correct dot colour + label for all 5 states.
describe('SyncStatusPill — all five states (SYNC-19)', () => {
  it('idle: renders nothing', () => {
    const { container } = render(<SyncStatusPill status="idle" lastSyncAt={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('connecting: pulsing yellow dot + "Connecting…"', () => {
    render(<SyncStatusPill status="connecting" lastSyncAt={null} />)
    expect(screen.getByText('Connecting…')).toBeDefined()
    const dot = screen.getByText('Connecting…').previousElementSibling
    expect(dot?.className).toContain('bg-yellow-400')
    expect(dot?.className).toContain('animate-pulse')
  })

  it('connected (no timestamp): green dot + "Connected"', () => {
    render(<SyncStatusPill status="connected" lastSyncAt={null} />)
    expect(screen.getByText('Connected')).toBeDefined()
    const dot = screen.getByText('Connected').previousElementSibling
    expect(dot?.className).toContain('bg-green-400')
  })

  it('connected (with timestamp): green dot + relative time label', () => {
    render(<SyncStatusPill status="connected" lastSyncAt={Date.now()} />)
    expect(screen.getByText('Synced just now')).toBeDefined()
    const dot = screen.getByText('Synced just now').previousElementSibling
    expect(dot?.className).toContain('bg-green-400')
  })

  it('pushing: pulsing yellow dot + "Pushing…"', () => {
    render(<SyncStatusPill status="pushing" lastSyncAt={null} />)
    expect(screen.getByText('Pushing…')).toBeDefined()
    const dot = screen.getByText('Pushing…').previousElementSibling
    expect(dot?.className).toContain('bg-yellow-400')
    expect(dot?.className).toContain('animate-pulse')
  })

  it('error: red dot + "Sync error"', () => {
    render(<SyncStatusPill status="error" lastSyncAt={null} />)
    expect(screen.getByText('Sync error')).toBeDefined()
    const dot = screen.getByText('Sync error').previousElementSibling
    expect(dot?.className).toContain('bg-red-400')
  })
})
