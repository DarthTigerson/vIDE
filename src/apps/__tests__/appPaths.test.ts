import { describe, it, expect } from 'vitest'
import {
  buildAppTabPath, parseAppTabPath, isAppTabPath, buildAppSettingsPath, appSettingsIdFromPath,
} from '@/components/Settings/paths'

describe('app paths', () => {
  it('round-trips a tab path with params', () => {
    const p = buildAppTabPath('docker', 'logs', { id: 'a b/c', n: 1 })
    expect(p.startsWith('app-tab://docker/logs?p=')).toBe(true)
    expect(isAppTabPath(p)).toBe(true)
    expect(parseAppTabPath(p)).toEqual({ appId: 'docker', kind: 'logs', params: { id: 'a b/c', n: 1 } })
  })
  it('rejects non app tab paths', () => {
    expect(parseAppTabPath('store://Store')).toBeNull()
    expect(parseAppTabPath('app-tab://nokind')).toBeNull()
    expect(isAppTabPath('settings://app/x')).toBe(false)
  })
  it('settings path round-trip', () => {
    expect(buildAppSettingsPath('hello')).toBe('settings://app/hello')
    expect(appSettingsIdFromPath('settings://app/hello')).toBe('hello')
    expect(appSettingsIdFromPath('settings://General')).toBeNull()
    expect(appSettingsIdFromPath('settings://app/')).toBeNull()
  })
})
