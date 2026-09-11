import { describe, it, expect, beforeEach } from 'vitest'
import { useNotificationPanelStore } from '../notificationPanelStore'

beforeEach(() => {
  useNotificationPanelStore.setState({ open: false })
})

describe('notificationPanelStore', () => {
  it('starts closed', () => {
    expect(useNotificationPanelStore.getState().open).toBe(false)
  })

  it('toggle opens it from closed', () => {
    useNotificationPanelStore.getState().toggle()
    expect(useNotificationPanelStore.getState().open).toBe(true)
  })

  it('toggle closes it from open', () => {
    useNotificationPanelStore.setState({ open: true })
    useNotificationPanelStore.getState().toggle()
    expect(useNotificationPanelStore.getState().open).toBe(false)
  })

  it('close always sets it closed', () => {
    useNotificationPanelStore.setState({ open: true })
    useNotificationPanelStore.getState().close()
    expect(useNotificationPanelStore.getState().open).toBe(false)
  })
})
