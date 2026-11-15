import type { StoreListing } from '@/types/api'
import { AppMonogram, MadeByVide, ghostPillClass } from './storeUi'

// One app in the Store grid (mockup board 1). Install/Update arrive with the
// app runtime (STORE Part 2); for now the card opens the app's page.
export function StoreAppCard({ app, onOpen }: { app: StoreListing; onOpen: () => void }) {
  return (
    <article
      className="bg-panel border border-border rounded-[10px] p-4 flex flex-col gap-2.5 min-w-0 cursor-pointer hover:border-accent/45 transition-colors"
      onClick={onOpen}
    >
      <div className="flex gap-3 items-center min-w-0">
        <AppMonogram name={app.name} />
        <div className="min-w-0 flex flex-col">
          <h2 className="text-sm font-semibold text-fg truncate">{app.name}</h2>
          <MadeByVide />
        </div>
      </div>
      <p className="text-xs text-fg-muted leading-relaxed">{app.description}</p>
      <div className="flex items-center justify-between gap-2 mt-auto">
        <span className="text-[0.6875rem] text-fg-subtle">
          Version {app.latest.version}
          {!app.compatible && <span className="text-accent"> · needs vIDE {app.latest.minVide}</span>}
        </span>
        <button
          type="button"
          className={ghostPillClass}
          onClick={(e) => { e.stopPropagation(); onOpen() }}
          aria-label={`View ${app.name}`}
        >
          View
        </button>
      </div>
    </article>
  )
}
