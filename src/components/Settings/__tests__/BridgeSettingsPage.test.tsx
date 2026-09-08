/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { BridgeSettingsPage } from '../BridgeSettingsPage'
import { useModelSettingsStore } from '@/stores/modelSettingsStore'
import { useBridgeSettingsStore } from '@/stores/bridgeSettingsStore'

function baseWindowApi() {
  return {}
}

beforeEach(() => {
  ;(global as any).window.api = baseWindowApi()
})

afterEach(() => {
  cleanup()
  useModelSettingsStore.setState({ enabled: { claude: true, bridge: true } })
  useBridgeSettingsStore.setState({ endpoint: '', apiKey: '', modelId: '' })
})

describe('BridgeSettingsPage general section', () => {
  it('reflects the current enabled state', () => {
    useModelSettingsStore.setState({ enabled: { claude: true, bridge: false } })
    render(<BridgeSettingsPage />)
    expect(screen.getByRole('switch', { name: 'Bridge' })).toHaveAttribute('aria-checked', 'false')
  })

  it('toggles on click', () => {
    render(<BridgeSettingsPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Bridge' }))
    expect(useModelSettingsStore.getState().enabled.bridge).toBe(false)
  })
})

describe('BridgeSettingsPage connection section', () => {
  it('is visible when bridge is enabled', () => {
    useModelSettingsStore.setState({ enabled: { claude: true, bridge: true } })
    render(<BridgeSettingsPage />)
    expect(screen.getByLabelText('Endpoint')).toBeTruthy()
  })

  it('is hidden when bridge is disabled', () => {
    useModelSettingsStore.setState({ enabled: { claude: true, bridge: false } })
    render(<BridgeSettingsPage />)
    expect(screen.queryByLabelText('Endpoint')).toBeNull()
  })

  it('renders current settings values', () => {
    useBridgeSettingsStore.setState({ endpoint: 'http://host:8002/v1', apiKey: 'local', modelId: 'test-model' })
    render(<BridgeSettingsPage />)

    expect((screen.getByLabelText('Endpoint') as HTMLInputElement).value).toBe('http://host:8002/v1')
    expect((screen.getByLabelText('API Key') as HTMLInputElement).value).toBe('local')
    expect((screen.getByLabelText('Model ID') as HTMLInputElement).value).toBe('test-model')
  })

  it('updates the store when a field changes', () => {
    render(<BridgeSettingsPage />)
    fireEvent.change(screen.getByLabelText('Endpoint'), { target: { value: 'http://new:8002/v1' } })
    expect(useBridgeSettingsStore.getState().endpoint).toBe('http://new:8002/v1')
  })

  it('shows a success message when the test connection succeeds', async () => {
    ;(global as any).window.api = { ...baseWindowApi(), bridgeTestConnection: vi.fn().mockResolvedValue({ ok: true }) }
    render(<BridgeSettingsPage />)

    fireEvent.click(screen.getByText('Test Connection'))

    await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy())
  })

  it('shows an error message when the test connection fails', async () => {
    ;(global as any).window.api = { ...baseWindowApi(), bridgeTestConnection: vi.fn().mockResolvedValue({ ok: false, error: 'HTTP 401' }) }
    render(<BridgeSettingsPage />)

    fireEvent.click(screen.getByText('Test Connection'))

    await waitFor(() => expect(screen.getByText('HTTP 401')).toBeTruthy())
  })
})
