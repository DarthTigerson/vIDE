// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { VcloakPanel } from '../VcloakPanel'
import { useVcloakStore } from '@/stores/vcloakStore'

describe('VcloakPanel', () => {
  beforeEach(() => {
    ;(window as any).api = {
      vcloakListRepos: vi.fn().mockResolvedValue([
        { remote: 'acme/platform/billing', local: null, alias: 'zq/kx', cloaked: true },
        { remote: 'acme/platform/web', local: null, alias: null, cloaked: false },
      ]),
      vcloakRescan: vi.fn(),
    }
    useVcloakStore.setState({
      state: {
        config: { enabled: true },
        gateway: { running: true, port: 1, error: null },
        stats: { requests: 7, masked: 3, blocked: 1 },
      } as any,
    })
  })

  it('shows status, counters and repos', async () => {
    render(<VcloakPanel />)
    expect(screen.getByText('vCloak is On')).toBeTruthy()
    expect(screen.getByText('Gateway: running')).toBeTruthy()
    expect(screen.getByText('Requests: 7')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('billing')).toBeTruthy())
    expect(screen.getByText('zq/kx')).toBeTruthy()
    expect(screen.getByText('visible')).toBeTruthy()
  })
})
