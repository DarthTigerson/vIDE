import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMobileStore } from '../mobileStore'
import type { MobileState } from '@/types/api'

const runningState: MobileState = {
  running: true,
  port: 7842,
  localIp: '192.168.1.5',
  pin: '12345',
  qrSvg: '<svg></svg>',
  connectedCount: 2,
  allowingNewDevice: false,
  interfaces: [{ name: 'en0', address: '192.168.1.5' }],
  devices: [{ id: 'tok-1', label: 'iPhone', connectedAt: 0 }],
  tlsFingerprint: 'AB:CD',
}

let stateListener: ((state: MobileState) => void) | undefined

vi.stubGlobal('window', {
  api: {
    mobileGetState: vi.fn().mockResolvedValue(runningState),
    onMobileState: vi.fn((cb: (state: MobileState) => void) => {
      stateListener = cb
      return () => {
        stateListener = undefined
      }
    }),
  },
})

describe('mobileStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateListener = undefined
    useMobileStore.setState({
      state: {
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
      },
      initialized: false,
    })
  })

  it('fetches initial state on init', async () => {
    await useMobileStore.getState().init()
    expect(window.api.mobileGetState).toHaveBeenCalled()
    expect(useMobileStore.getState().state).toEqual(runningState)
  })

  it('applies pushed state updates', async () => {
    await useMobileStore.getState().init()
    const pushed: MobileState = { ...runningState, connectedCount: 3 }
    stateListener?.(pushed)
    expect(useMobileStore.getState().state.connectedCount).toBe(3)
  })

  it('does not re-subscribe on repeated init calls', async () => {
    await useMobileStore.getState().init()
    await useMobileStore.getState().init()
    expect(window.api.onMobileState).toHaveBeenCalledTimes(1)
    expect(window.api.mobileGetState).toHaveBeenCalledTimes(1)
  })
})
