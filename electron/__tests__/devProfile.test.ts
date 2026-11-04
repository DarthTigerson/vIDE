import { describe, it, expect, vi, beforeEach } from 'vitest'

const { app } = vi.hoisted(() => ({
  app: {
    isPackaged: false,
    getPath: vi.fn((name: string) => (name === 'appData' ? '/Users/x/Library/Application Support' : '')),
    setPath: vi.fn(),
  },
}))
vi.mock('electron', () => ({ app }))

import { applyDevProfile, isIsolatedDevProfile } from '../devProfile'

describe('devProfile (VIDE-24)', () => {
  beforeEach(() => {
    app.setPath.mockClear()
    app.isPackaged = false
    delete process.env.VIDE_DEV_SHARED_PROFILE
  })

  it('isolates unpackaged runs unless VIDE_DEV_SHARED_PROFILE=1', () => {
    expect(isIsolatedDevProfile(false, {})).toBe(true)
    expect(isIsolatedDevProfile(false, { VIDE_DEV_SHARED_PROFILE: '1' })).toBe(false)
    expect(isIsolatedDevProfile(true, {})).toBe(false)
  })

  it('points userData at vIDE-dev for a dev run', () => {
    applyDevProfile()
    expect(app.setPath).toHaveBeenCalledWith('userData', '/Users/x/Library/Application Support/vIDE-dev')
  })

  it('leaves the packaged app and the opt-out alone', () => {
    app.isPackaged = true
    applyDevProfile()
    app.isPackaged = false
    process.env.VIDE_DEV_SHARED_PROFILE = '1'
    applyDevProfile()
    expect(app.setPath).not.toHaveBeenCalled()
  })
})
