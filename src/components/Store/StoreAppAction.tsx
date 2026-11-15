import type { StoreListing } from '@/types/api'
import { useAppContribStore } from '@/apps/appContribStore'
import { useStoreStore, appAction } from '@/stores/storeStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildStoreAppPath } from '@/components/Settings/paths'
import { accentSolidColor } from '@/components/ui/pillButton'
import { ghostPillClass } from './storeUi'

const pill = 'h-7 px-3.5 rounded-full text-[0.6875rem] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
const solidPillClass = `${pill} ${accentSolidColor}`
const outlinePillClass = `${pill} border border-accent text-accent hover:bg-accent/10`

// The one primary action for an app (Install / Update / Open / Restart ...),
// shared by the Store list row and the app page. Installed state comes from
// appContribStore; only the in-flight request and its error live in storeStore.
export function StoreAppAction({ app }: { app: StoreListing }) {
  const installed = useAppContribStore((s) => s.apps.find((a) => a.id === app.id))
  const hasPanel = useAppContribStore((s) => !!s.panels[app.id] || !!s.apps.find((a) => a.id === app.id)?.contributes.sidebarPanel)
  const requestPanel = useAppContribStore((s) => s.requestPanel)
  const busy = useStoreStore((s) => s.busy[app.id])
  const error = useStoreStore((s) => s.errors[app.id])
  const install = useStoreStore((s) => s.install)
  const openTab = useEditorStore((s) => s.openTab)

  const action = appAction(app, installed)
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn() }

  let control: React.ReactNode
  if (busy) {
    control = <button type="button" disabled className={action === 'update' ? outlinePillClass : solidPillClass}>{busy === 'installing' ? 'Installing…' : 'Uninstalling…'}</button>
  } else if (action === 'install') {
    control = <button type="button" className={solidPillClass} onClick={stop(() => void install(app.id))}>Install</button>
  } else if (action === 'update') {
    control = <button type="button" className={outlinePillClass} onClick={stop(() => void install(app.id))}>Update</button>
  } else if (action === 'open') {
    control = (
      <button
        type="button"
        className={ghostPillClass}
        onClick={stop(() => (hasPanel ? requestPanel(app.id) : openTab({ path: buildStoreAppPath(app.id), content: '', dirty: false })))}
      >
        Open
      </button>
    )
  } else if (action === 'restart') {
    control = <button type="button" className={outlinePillClass} onClick={stop(() => void window.api.appsRestart())}>Restart to finish</button>
  } else if (action === 'needs-vide') {
    control = <span className="text-[0.6875rem] text-accent">Needs vIDE {app.latest.minVide}</span>
  } else {
    control = <span className="text-[0.6875rem] text-accent" title={installed?.error}>Failed to load</span>
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {control}
      {error && <p className="text-[0.6875rem] text-accent max-w-[240px] text-right">{error}</p>}
    </div>
  )
}
