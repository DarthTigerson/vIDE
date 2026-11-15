import type { StoreListing } from '@/types/api'
import { AppMonogram, MadeByVsuite, ghostPillClass } from './storeUi'

// One app in the Store list (canvas board C). Install/Update arrive with the
// app runtime (STORE Part 2); for now the row opens the app's page.
export function StoreAppRow({ app, onOpen }: { app: StoreListing; onOpen: () => void }) {
  return (
    <article
      className="bg-panel border border-border rounded-[10px] px-4 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0 cursor-pointer hover:border-accent/45 transition-colors"
      onClick={onOpen}
    >
      <AppMonogram name={app.name} />
      <div className="flex-[1_1_260px] min-w-0 flex flex-col gap-0.5">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h2 className="text-sm font-semibold text-fg truncate">{app.name}</h2>
          <MadeByVsuite suffix={app.recommended ? 'Recommended' : undefined} />
        </div>
        <p className="text-xs text-fg-muted leading-relaxed">{app.description}</p>
      </div>
      <span className="text-[0.6875rem] text-fg-subtle text-right">
        {app.latest.version}
        {!app.compatible && <span className="block text-accent">needs vIDE {app.latest.minVide}</span>}
      </span>
      <button
        type="button"
        className={ghostPillClass}
        onClick={(e) => { e.stopPropagation(); onOpen() }}
        aria-label={`View ${app.name}`}
      >
        View
      </button>
    </article>
  )
}
