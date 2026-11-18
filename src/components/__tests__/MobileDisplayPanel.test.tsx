import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MobileDisplayPanel } from '@/components/MobileDisplay/MobileDisplayPanel'
import { useMobileStore } from '@/stores/mobileStore'
import type { MobileState } from '@/types/api'

const defaultState: MobileState = {
  running: false,
  port: 7842,
  localIp: '127.0.0.1',
  pin: '',
  qrSvg: '',
  connectedCount: 0,
  allowingNewDevice: true,
  interfaces: [],
  devices: [],
  tlsFingerprint: '',
}

function mockApi(state: MobileState) {
  Object.defineProperty(window, 'api', {
    value: {
      mobileGetState: vi.fn().mockResolvedValue(state),
      mobileStart: vi.fn().mockResolvedValue(undefined),
      mobileStop: vi.fn().mockResolvedValue(undefined),
      mobileAddDevice: vi.fn().mockResolvedValue(undefined),
      mobileSelectInterface: vi.fn().mockResolvedValue(undefined),
      mobileDisconnectDevice: vi.fn().mockResolvedValue(undefined),
      mobileDisconnectAll: vi.fn().mockResolvedValue(undefined),
      onMobileState: vi.fn().mockReturnValue(() => {}),
    },
    writable: true,
    configurable: true,
  })
}

beforeEach(() => {
  useMobileStore.setState({ initialized: false, state: defaultState })
  mockApi(defaultState)
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  })
})

describe('MobileDisplayPanel', () => {
  it('renders the panel header', () => {
    render(<MobileDisplayPanel />)
    expect(screen.getByText('Mobile Display')).toBeTruthy()
  })

  it('shows the toggle', () => {
    render(<MobileDisplayPanel />)
    expect(screen.getByLabelText('Start mobile server')).toBeTruthy()
  })

  it('shows off-state prompt when not running', () => {
    render(<MobileDisplayPanel />)
    expect(screen.getByText(/Turn on to start/)).toBeTruthy()
  })

  it('shows a network dropdown only when more than one interface is detected', async () => {
    mockApi({
      ...defaultState,
      running: true,
      pin: '12345',
      interfaces: [{ name: 'en0', address: '192.168.1.50' }],
    })
    const { unmount } = render(<MobileDisplayPanel />)
    expect(await screen.findByText(/Scan the QR code/)).toBeTruthy()
    expect(screen.queryByLabelText('Pairing network')).toBeNull()
    unmount()

    useMobileStore.setState({ initialized: false, state: defaultState })
    mockApi({
      ...defaultState,
      running: true,
      pin: '12345',
      interfaces: [
        { name: 'en0', address: '192.168.1.50' },
        { name: 'en5', address: '10.0.0.20' },
      ],
    })
    render(<MobileDisplayPanel />)
    expect(await screen.findByLabelText('Pairing network')).toBeTruthy()
  })

  it('calls mobileSelectInterface when a different network is chosen', async () => {
    const user = userEvent.setup()
    mockApi({
      ...defaultState,
      running: true,
      pin: '12345',
      localIp: '192.168.1.50',
      interfaces: [
        { name: 'en0', address: '192.168.1.50' },
        { name: 'en5', address: '10.0.0.20' },
      ],
    })
    render(<MobileDisplayPanel />)
    const select = await screen.findByLabelText('Pairing network')
    await user.click(select)
    await user.click(await screen.findByRole('option', { name: 'en5 — 10.0.0.20' }))
    expect(window.api.mobileSelectInterface).toHaveBeenCalledWith('10.0.0.20')
  })

  it('copies the pairing URL to the clipboard', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    mockApi({
      ...defaultState,
      running: true,
      pin: '12345',
      localIp: '192.168.1.50',
      port: 7842,
      interfaces: [{ name: 'en0', address: '192.168.1.50' }],
    })
    render(<MobileDisplayPanel />)
    const copyButton = await screen.findByLabelText('Copy pairing URL')
    await user.click(copyButton)
    expect(writeText).toHaveBeenCalledWith('https://192.168.1.50:7842')
  })

  it('copies the PIN to the clipboard', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    mockApi({
      ...defaultState,
      running: true,
      pin: '12345',
      interfaces: [{ name: 'en0', address: '127.0.0.1' }],
    })
    render(<MobileDisplayPanel />)
    const copyButton = await screen.findByLabelText('Copy PIN')
    await user.click(copyButton)
    expect(writeText).toHaveBeenCalledWith('12345')
  })

  it('lists connected devices with a disconnect action for each, plus a disconnect-all button', async () => {
    const user = userEvent.setup()
    mockApi({
      ...defaultState,
      running: true,
      allowingNewDevice: false,
      connectedCount: 2,
      devices: [
        { id: 'tok-1', label: 'iPhone', connectedAt: Date.now() },
        { id: 'tok-2', label: 'iPad', connectedAt: Date.now() },
      ],
    })
    render(<MobileDisplayPanel />)

    expect(await screen.findByText('iPhone')).toBeTruthy()
    expect(screen.getByText('iPad')).toBeTruthy()

    await user.click(screen.getByLabelText('Disconnect iPhone'))
    expect(window.api.mobileDisconnectDevice).toHaveBeenCalledWith('tok-1')

    await user.click(screen.getByText('Disconnect all'))
    expect(window.api.mobileDisconnectAll).toHaveBeenCalled()
  })
})
