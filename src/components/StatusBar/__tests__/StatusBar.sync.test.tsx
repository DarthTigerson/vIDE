import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { useConfigRepoStore } from '@/stores/configRepoStore'
import { StatusBar } from '../StatusBar'

// SYNC-18: StatusBar sync icon — appears when enabled, calls push() on click,
// disables itself while pushing/connecting, tooltip reflects status.

const mockPush = vi.fn(async () => {})

beforeEach(() => {
  ;(global as any).window.api = {
    gitBranch: async () => null,
    gitAheadBehind: async () => null,
    configRepoGetSettings: async () => ({
      enabled: false, repoUrl: '', token: '', categories: {},
    }),
    configRepoPush: mockPush,
  }
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  useConfigRepoStore.setState({ enabled: false, status: 'idle', push: mockPush })
})

describe('StatusBar sync icon (SYNC-18)', () => {
  it('is hidden when sync is disabled', () => {
    useConfigRepoStore.setState({ enabled: false, status: 'idle' })
    render(<StatusBar />)
    expect(screen.queryByTitle(/vide sync/i)).toBeNull()
  })

  it('is visible when sync is enabled', () => {
    useConfigRepoStore.setState({ enabled: true, status: 'connected', push: mockPush })
    render(<StatusBar />)
    expect(screen.getByTitle('vIDE Sync — click to push now')).toBeDefined()
  })

  it('calls push() when clicked in connected state', () => {
    useConfigRepoStore.setState({ enabled: true, status: 'connected', push: mockPush })
    render(<StatusBar />)
    fireEvent.click(screen.getByTitle('vIDE Sync — click to push now'))
    expect(mockPush).toHaveBeenCalledTimes(1)
  })

  it('is disabled and shows pushing tooltip while status is pushing', () => {
    useConfigRepoStore.setState({ enabled: true, status: 'pushing', push: mockPush })
    render(<StatusBar />)
    const btn = screen.getByTitle('Pushing…') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('shows error tooltip and is enabled for retry when status is error', () => {
    useConfigRepoStore.setState({ enabled: true, status: 'error', push: mockPush })
    render(<StatusBar />)
    const btn = screen.getByTitle('Sync error — click to retry') as HTMLButtonElement
    expect(btn.disabled).toBe(false)
    fireEvent.click(btn)
    expect(mockPush).toHaveBeenCalledTimes(1)
  })
})
