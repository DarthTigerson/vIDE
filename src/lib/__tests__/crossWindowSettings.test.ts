// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { onOtherWindowChange, isApplyingOtherWindowChange } from '../crossWindowSettings'

function fire(key: string | null) {
  window.dispatchEvent(new StorageEvent('storage', { key, storageArea: window.localStorage }))
}

describe('onOtherWindowChange', () => {
  it('reloads only for its own keys', () => {
    const reload = vi.fn()
    onOtherWindowChange(['vide:a', 'vide:b'], reload)
    fire('vide:other')
    expect(reload).not.toHaveBeenCalled()
    fire('vide:b')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads on localStorage.clear() (null key)', () => {
    const reload = vi.fn()
    onOtherWindowChange(['vide:c'], reload)
    fire(null)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('flags the reload so it does not schedule a sync push, and clears the flag after', () => {
    let during = false
    onOtherWindowChange(['vide:d'], () => { during = isApplyingOtherWindowChange() })
    fire('vide:d')
    expect(during).toBe(true)
    expect(isApplyingOtherWindowChange()).toBe(false)
  })

  it('clears the flag even when the reload throws', () => {
    onOtherWindowChange(['vide:e'], () => { throw new Error('boom') })
    try { fire('vide:e') } catch { /* jsdom may rethrow listener errors */ }
    expect(isApplyingOtherWindowChange()).toBe(false)
  })
})
