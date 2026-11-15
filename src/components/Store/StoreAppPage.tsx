import { useEffect } from 'react'
import { useStoreStore, findStoreApp } from '@/stores/storeStore'
import { useEditorStore } from '@/stores/editorStore'
import { STORE_TAB_PATH } from '@/components/Settings/paths'
import { openUrlInBrowserTab } from '@/components/Chat/terminalLinks'
import { AppMonogram, MadeByVide } from './storeUi'

// One app's Store page (store://app/<id>), mockup board 2. Install, Update,
// Uninstall and "What it adds to vIDE" need the app runtime (STORE Part 2).
export function StoreAppPage({ appId }: { appId: string }) {
  const registry = useStoreStore((s) => s.registry)
  const load = useStoreStore((s) => s.load)
  const openTab = useEditorStore((s) => s.openTab)

  useEffect(() => { if (!useStoreStore.getState().registry) void load(false) }, [load])

  const back = (
    <button
      type="button"
      className="self-start text-xs text-fg-muted hover:text-fg"
      onClick={() => openTab({ path: STORE_TAB_PATH, content: '', dirty: false })}
    >
      ← All apps
    </button>
  )

  const app = findStoreApp(registry, appId)
  if (!app) {
    return (
      <div className="h-full overflow-y-auto bg-bg text-fg">
        <div className="px-10 py-7 flex flex-col gap-4">
          {back}
          <p className="text-sm text-fg-muted">{registry ? 'App not found in the Store.' : 'Loading the Store…'}</p>
        </div>
      </div>
    )
  }

  const { latest } = app
  return (
    <div className="h-full overflow-y-auto bg-bg text-fg">
      <div className="px-10 py-7 flex flex-col gap-6 max-w-[1040px]">
        {back}

        <header className="flex flex-wrap gap-4 items-center">
          <AppMonogram name={app.name} size="lg" />
          <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-1">
            <h1 className="text-[1.375rem] font-bold">{app.name}</h1>
            <MadeByVide suffix={app.repo} />
            <p className="text-[0.8125rem] text-fg-muted">{app.description}</p>
          </div>
        </header>

        <div className="flex flex-wrap gap-8">
          <section className="flex-[999_1_420px] min-w-0 flex flex-col gap-2.5">
            <h2 className="text-[0.625rem] font-bold tracking-wider uppercase text-fg-subtle">What's new in {latest.version}</h2>
            <div className="bg-panel border border-border rounded-[10px] p-4 text-xs text-fg-muted leading-relaxed">
              {latest.notesUrl ? (
                <button type="button" className="text-accent hover:underline" onClick={() => openUrlInBrowserTab(latest.notesUrl!)}>
                  Read release notes
                </button>
              ) : (
                'No release notes for this version.'
              )}
            </div>
          </section>

          <aside className="flex-[1_1_260px] min-w-0 flex flex-col gap-2.5">
            <h2 className="text-[0.625rem] font-bold tracking-wider uppercase text-fg-subtle">Details</h2>
            <dl className="bg-panel border border-border rounded-[10px] px-4 py-2.5 text-xs">
              <Row label="Latest" value={latest.version} />
              <Row label="Commit" value={<span className="font-mono" title={latest.commit}>{latest.commit.slice(0, 7)}</span>} />
              <Row
                label="Needs vIDE"
                value={app.compatible
                  ? `${latest.minVide} or newer`
                  : <span className="text-accent">{latest.minVide} or newer — update vIDE</span>}
              />
            </dl>
            <button
              type="button"
              className="self-start text-xs text-accent hover:underline"
              onClick={() => openUrlInBrowserTab(`https://github.com/${app.repo}`)}
            >
              View source
            </button>
          </aside>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-fg text-right">{value}</dd>
    </div>
  )
}
