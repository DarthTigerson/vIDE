import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useVcloakStore } from '../vcloakStore'

const fakeState = { config: { enabled: true } } as any

describe('vcloakStore', () => {
  beforeEach(() => {
    useVcloakStore.setState({ state: null })
    ;(globalThis as any).window = (globalThis as any).window ?? globalThis
    ;(window as any).api = {
      vcloakGetState: vi.fn().mockResolvedValue(fakeState),
      vcloakSetConfig: vi.fn(),
    }
  })

  it('loads state', async () => {
    await useVcloakStore.getState().load()
    expect(useVcloakStore.getState().state).toBe(fakeState)
  })

  it('setEnabled stores state and returns null on ok', async () => {
    ;(window as any).api.vcloakSetConfig.mockResolvedValue({ ok: true, state: fakeState })
    expect(await useVcloakStore.getState().setEnabled(true)).toBeNull()
    expect((window as any).api.vcloakSetConfig).toHaveBeenCalledWith({ enabled: true })
    expect(useVcloakStore.getState().state).toBe(fakeState)
  })

  it('setEnabled returns the error and keeps state on failure', async () => {
    ;(window as any).api.vcloakSetConfig.mockResolvedValue({ ok: false, error: 'Set a root first' })
    expect(await useVcloakStore.getState().setEnabled(true)).toBe('Set a root first')
    expect(useVcloakStore.getState().state).toBeNull()
  })
})
