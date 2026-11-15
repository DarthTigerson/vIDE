import { useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { accentSolidColor } from '@/components/ui/pillButton'
import { useAppContribStore } from '@/apps/appContribStore'
import { useStoreStore } from '@/stores/storeStore'
import { movedApps, readLocalKey } from '@/lib/storeUpdates'
import { AppMonogram } from './storeUi'
import { StoreAppAction } from './StoreAppAction'

// "Some apps moved to the Store": one row per built-in app that left vIDE
// core and was enabled here, with Install, plus Install all and Dismiss.
// Opened from the bell notice (storeStore.movedNoticeOpen).
export function MovedAppsModal() {
  const open = useStoreStore((s) => s.movedNoticeOpen)
  const registry = useStoreStore((s) => s.registry)
  const dismissed = useStoreStore((s) => s.movedNoticeDismissed)
  const busy = useStoreStore((s) => s.busy)
  const installed = useAppContribStore((s) => s.apps)
  const install = useStoreStore((s) => s.install)
  const dismiss = useStoreStore((s) => s.dismissMovedNotice)
  const setOpen = useStoreStore((s) => s.setMovedNoticeOpen)

  const apps = movedApps(registry, installed, readLocalKey, dismissed)
  const installable = apps.filter((a) => a.compatible && !busy[a.id])

  // Everything installed: the notice is done for good, even if an app is
  // uninstalled again later.
  useEffect(() => {
    if (open && apps.length === 0) dismiss()
  }, [open, apps.length, dismiss])

  if (!open || apps.length === 0) return null
  const close = () => setOpen(false)
  return (
    <Modal onClose={close}>
      <h2 className="text-sm font-semibold text-fg mb-1">Some apps moved to the Store</h2>
      <p className="text-sm text-fg-muted mb-4">
        {apps.length === 1 ? 'This app is' : 'These apps are'} no longer built into vIDE. Install {apps.length === 1 ? 'it' : 'them'} from the Store to keep using {apps.length === 1 ? 'it' : 'them'}. Your settings carry over.
      </p>
      <ul className="flex flex-col gap-3 mb-5">
        {apps.map((app) => (
          <li key={app.id} className="flex items-center gap-3 min-w-0">
            <AppMonogram name={app.name} icon={app.icon} />
            <span className="flex-1 min-w-0 text-sm font-medium text-fg truncate">{app.name}</span>
            <StoreAppAction app={app} />
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={dismiss}
          className="px-4 py-1.5 text-sm rounded-lg border border-border text-fg-muted hover:text-fg hover:border-fg-muted transition-colors"
        >
          Dismiss
        </button>
        <button
          type="button"
          disabled={installable.length === 0}
          onClick={() => installable.forEach((a) => void install(a.id))}
          className={`px-4 py-1.5 text-sm rounded-lg font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${accentSolidColor}`}
        >
          Install all
        </button>
      </div>
    </Modal>
  )
}
