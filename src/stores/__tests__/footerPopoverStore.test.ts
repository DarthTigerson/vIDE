import { describe, it, expect, beforeEach } from 'vitest'
import { useFooterPopoverStore } from '../footerPopoverStore'

beforeEach(() => {
  useFooterPopoverStore.setState({ openId: null })
})

describe('footerPopoverStore', () => {
  it('opens one popover at a time — opening a second closes the first', () => {
    const { toggle } = useFooterPopoverStore.getState()
    toggle('autocomplete')
    expect(useFooterPopoverStore.getState().openId).toBe('autocomplete')
    toggle('display')
    expect(useFooterPopoverStore.getState().openId).toBe('display')
  })

  it('toggling the open popover by its own id closes it', () => {
    const { toggle } = useFooterPopoverStore.getState()
    toggle('display')
    toggle('display')
    expect(useFooterPopoverStore.getState().openId).toBeNull()
  })

  it('close() clears whatever is open', () => {
    useFooterPopoverStore.getState().toggle('autocomplete')
    useFooterPopoverStore.getState().close()
    expect(useFooterPopoverStore.getState().openId).toBeNull()
  })
})
