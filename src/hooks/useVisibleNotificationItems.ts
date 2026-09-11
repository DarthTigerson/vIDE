import { useEffect } from 'react'
import { useNotificationItems, type NotificationItem } from './useNotificationItems'
import { useNotificationAcknowledgedStore } from '@/stores/notificationAcknowledgedStore'

// Wraps useNotificationItems with acknowledgment: once the panel is closed
// on an item, it's hidden here (footer goes quiet) until the underlying
// condition actually clears and re-triggers — reconcile() below drops the
// acknowledgment the moment the id is no longer in the raw/active list, so a
// later re-trigger isn't silenced by a stale mark.
export function useVisibleNotificationItems(): NotificationItem[] {
  const items = useNotificationItems()
  const acknowledgedIds = useNotificationAcknowledgedStore((s) => s.acknowledgedIds)
  const reconcile = useNotificationAcknowledgedStore((s) => s.reconcile)

  const activeIdsKey = items.map((i) => i.id).sort().join(',')
  useEffect(() => {
    reconcile(activeIdsKey ? activeIdsKey.split(',') : [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdsKey, reconcile])

  return items.filter((item) => !acknowledgedIds.includes(item.id))
}
