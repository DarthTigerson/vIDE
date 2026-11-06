// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { installCloseMenusOnRightClick } from '../closeMenusOnRightClick'

let uninstall: (() => void) | null = null
afterEach(() => { uninstall?.(); uninstall = null; document.body.innerHTML = '' })

describe('installCloseMenusOnRightClick', () => {
  it('fires a window click before the right-clicked element handles contextmenu', () => {
    uninstall = installCloseMenusOnRightClick()
    const order: string[] = []
    const closeMenu = vi.fn(() => order.push('close'))
    window.addEventListener('click', closeMenu)
    const el = document.createElement('div')
    el.addEventListener('contextmenu', () => order.push('open'))
    document.body.appendChild(el)
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    window.removeEventListener('click', closeMenu)
    expect(order).toEqual(['close', 'open'])
  })

  it('stops after uninstall', () => {
    installCloseMenusOnRightClick()()
    const closeMenu = vi.fn()
    window.addEventListener('click', closeMenu)
    document.body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    window.removeEventListener('click', closeMenu)
    expect(closeMenu).not.toHaveBeenCalled()
  })
})
