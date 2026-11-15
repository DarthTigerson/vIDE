import { useEffect, useState } from 'react'
import { useStoreStore, findStoreApp } from '@/stores/storeStore'
import { useEditorStore } from '@/stores/editorStore'
import { useAppContribStore } from '@/apps/appContribStore'
import { ConfirmActionModal } from '@/components/Git/ConfirmActionModal'
import { STORE_TAB_PATH } from '@/components/Settings/paths'
import { openUrlInBrowserTab } from '@/components/Chat/terminalLinks'
import type { AppContributes } from '@/types/api'
import { AppMonogram, FromFileBadge, MadeByVsuite, formatReleased, formatSize, ghostPillClass } from './storeUi'
import { StoreScreenshots } from './StoreScreenshots'
import { StoreReadme } from './StoreReadme'
import { StoreAppAction } from './StoreAppAction'

// One app's Store page (store://app/<id>), mockup board 2.
export function StoreAppPage({ appId }: { appId: string }) {
  const registry = useStoreStore((s) => s.registry)
  const load = useStoreStore((s) => s.load)
  const openTab = useEditorStore((s) => s.openTab)
  const installed = useAppContribStore((s) => s.apps.find((a) => a.id === appId && a.source !== 'dev'))
  const busy = useStoreStore((s) => s.busy[appId])
  const uninstall = useStoreStore((s) => s.uninstall)
  const [confirming, setConfirming] = useState(false)

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
  const released = app.publishedAt ? formatReleased(app.publishedAt) : null
  const adds = installed ? addsToVide(installed.contributes) : []
  return (
    <div className="h-full overflow-y-auto bg-bg text-fg">
      <div className="px-10 py-7 flex flex-col gap-6 max-w-[1040px]">
        {back}

        <header className="flex flex-wrap gap-4 items-center">
          <AppMonogram name={app.name} size="lg" icon={app.icon} />
          <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-1">
            <h1 className="text-[1.375rem] font-bold">{app.name}</h1>
            <div className="flex items-center gap-2 min-w-0">
              <MadeByVsuite suffix={app.repo} />
              {installed?.source === 'file' && <FromFileBadge />}
            </div>
            <p className="text-[0.8125rem] text-fg-muted">{app.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <StoreAppAction app={app} />
            {installed && (
              <button type="button" className={ghostPillClass} disabled={!!busy} onClick={() => setConfirming(true)}>
                Uninstall
              </button>
            )}
          </div>
        </header>

        <StoreScreenshots urls={app.screenshots} name={app.name} />

        <div className="flex flex-wrap gap-8">
          <section className="flex-[999_1_420px] min-w-0 flex flex-col gap-5">
            <StoreReadme appId={app.id} hasReadme={!!app.readmeUrl} version={latest.version} />
            <div className="flex flex-col gap-2.5">
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
              {installed && adds.length > 0 && (
                <>
                  <h2 className="text-[0.625rem] font-bold tracking-wider uppercase text-fg-subtle mt-3">What it adds to vIDE</h2>
                  <ul className="bg-panel border border-border rounded-[10px] px-4 py-2.5 text-xs text-fg-muted list-disc list-inside">
                    {adds.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </>
              )}
            </div>
          </section>

          <aside className="flex-[1_1_260px] min-w-0 flex flex-col gap-2.5">
            <h2 className="text-[0.625rem] font-bold tracking-wider uppercase text-fg-subtle">Details</h2>
            <dl className="bg-panel border border-border rounded-[10px] px-4 py-2.5 text-xs">
              {installed && <Row label="Installed" value={installed.version} />}
              <Row label="Latest" value={latest.version} />
              {released && <Row label="Released" value={released} />}
              {app.size !== undefined && <Row label="Size" value={formatSize(app.size)} />}
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
      {confirming && (
        <ConfirmActionModal
          title={`Uninstall ${app.name}?`}
          message="Its settings stay, so reinstalling brings them back."
          confirmLabel="Uninstall"
          onConfirm={() => void uninstall(appId)}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  )
}

function addsToVide(c: AppContributes): string[] {
  const out: string[] = []
  if (c.sidebarPanel) out.push(`Sidebar panel "${c.sidebarPanel.title}"`)
  if (c.settingsPage) out.push('Settings page')
  if (c.commands) out.push('Palette commands')
  if (c.notifications) out.push('Notifications')
  return out
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-fg text-right">{value}</dd>
    </div>
  )
}
