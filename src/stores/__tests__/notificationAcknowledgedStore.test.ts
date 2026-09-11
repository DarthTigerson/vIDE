import { describe, it, expect, beforeEach } from 'vitest'
import { useNotificationAcknowledgedStore } from '../notificationAcknowledgedStore'

beforeEach(() => {
  useNotificationAcknowledgedStore.setState({ acknowledgedIds: [] })
})

describe('notificationAcknowledgedStore', () => {
  it('starts with nothing acknowledged', () => {
    expect(useNotificationAcknowledgedStore.getState().acknowledgedIds).toEqual([])
  })

  it('acknowledge marks the given ids', () => {
    useNotificationAcknowledgedStore.getState().acknowledge(['usage', 'docker'])
    expect(useNotificationAcknowledgedStore.getState().acknowledgedIds.sort()).toEqual(['docker', 'usage'])
  })

  it('acknowledge does not duplicate an id already marked', () => {
    useNotificationAcknowledgedStore.getState().acknowledge(['usage'])
    useNotificationAcknowledgedStore.getState().acknowledge(['usage', 'docker'])
    expect(useNotificationAcknowledgedStore.getState().acknowledgedIds.sort()).toEqual(['docker', 'usage'])
  })

  it('reconcile drops an acknowledged id once it is no longer active', () => {
    useNotificationAcknowledgedStore.getState().acknowledge(['usage'])
    useNotificationAcknowledgedStore.getState().reconcile([])
    expect(useNotificationAcknowledgedStore.getState().acknowledgedIds).toEqual([])
  })

  it('reconcile keeps an acknowledged id that is still active', () => {
    useNotificationAcknowledgedStore.getState().acknowledge(['usage', 'docker'])
    useNotificationAcknowledgedStore.getState().reconcile(['usage'])
    expect(useNotificationAcknowledgedStore.getState().acknowledgedIds).toEqual(['usage'])
  })
})
