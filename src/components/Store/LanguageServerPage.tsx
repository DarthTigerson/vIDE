import { useEffect } from 'react'
import { useStoreStore, findLanguageServer } from '@/stores/storeStore'
import { useEditorStore } from '@/stores/editorStore'
import { useLspStatusStore, subscribeLspEvents } from '@/stores/lspStatusStore'
import { STORE_TAB_PATH } from '@/components/Settings/paths'
import { openUrlInBrowserTab } from '@/components/Chat/terminalLinks'
import { installSourceText } from '@/lib/lspInstallSource'
import { AppMonogram } from './storeUi'
import { ByAuthor, LanguageServerAction, useServerVersion } from './LanguageServerAction'

// One language server's Store page (store://server/<id>), shaped like
// StoreAppPage: what it does, where vIDE installs it from, and its memory use.
export function LanguageServerPage({ serverId }: { serverId: string }) {
  const registry = useStoreStore((s) => s.registry)
  const load = useStoreStore((s) => s.load)
  const openTab = useEditorStore((s) => s.openTab)
  const output = useLspStatusStore((s) => s.installOutput[serverId] ?? '')
  const installing = useLspStatusStore((s) => s.installing[serverId] ?? false)
  const failed = useLspStatusStore((s) => s.installFailed[serverId] ?? false)

  useEffect(() => {
    subscribeLspEvents()
    void useLspStatusStore.getState().refresh()
    if (!useStoreStore.getState().registry) void load(false)
  }, [load])

  const back = (
    <button
      type="button"
      className="self-start text-xs text-fg-muted hover:text-fg"
      onClick={() => openTab({ path: STORE_TAB_PATH, content: '', dirty: false })}
    >
      ← All apps
    </button>
  )

  const server = findLanguageServer(registry, serverId)
  if (!server) {
    return (
      <div className="h-full overflow-y-auto bg-bg text-fg">
        <div className="px-10 py-7 flex flex-col gap-4">
          {back}
          <p className="text-sm text-fg-muted">{registry ? 'Language server not found in the Store.' : 'Loading the Store…'}</p>
        </div>
      </div>
    )
  }
  return <Page server={server} back={back} output={output} showOutput={(installing || failed) && output.length > 0} />
}

function Page({ server, back, output, showOutput }: {
  server: NonNullable<ReturnType<typeof findLanguageServer>>
  back: React.ReactNode
  output: string
  showOutput: boolean
}) {
  const { installed } = useServerVersion(server)
  return (
    <div className="h-full overflow-y-auto bg-bg text-fg">
      <div className="px-10 py-7 flex flex-col gap-6 max-w-[1040px]">
        {back}

        <header className="flex flex-wrap gap-4 items-center">
          <AppMonogram name={server.name} size="lg" icon={server.icon} />
          <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-1">
            <h1 className="text-[1.375rem] font-bold">{server.name}</h1>
            <ByAuthor author={server.author} />
            <p className="text-[0.8125rem] text-fg-muted">{server.description}</p>
          </div>
          <LanguageServerAction server={server} />
        </header>

        {showOutput && (
          <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-[10px] border border-border bg-panel p-3 text-[0.6875rem] text-fg-muted">
            {output}
          </pre>
        )}

        <div className="flex flex-wrap gap-8">
          <section className="flex-[999_1_420px] min-w-0 flex flex-col gap-2.5">
            <h2 className="text-[0.625rem] font-bold tracking-wider uppercase text-fg-subtle">Installs with</h2>
            <div className="bg-panel border border-border rounded-[10px] px-4 py-3 font-mono text-xs text-fg [overflow-wrap:anywhere]">
              {installSourceText(server.install)}
            </div>
            <p className="text-xs text-fg-muted leading-relaxed">
              vIDE runs this once and then starts the server whenever you open a file in one of its languages.
              Remove takes it out of vIDE; the program itself stays on your machine.
            </p>
          </section>

          <aside className="flex-[1_1_260px] min-w-0 flex flex-col gap-2.5">
            <h2 className="text-[0.625rem] font-bold tracking-wider uppercase text-fg-subtle">Details</h2>
            <dl className="bg-panel border border-border rounded-[10px] px-4 py-2.5 text-xs">
              {installed && <Row label="Installed" value={installed} />}
              {server.version && <Row label="Latest" value={server.version} />}
              {server.author && <Row label="Made by" value={server.author} />}
              <Row label="Languages" value={server.languages.join(', ')} />
              {server.ramEstimate && <Row label="Memory" value={server.ramEstimate} />}
            </dl>
            {server.homepage && (
              <button
                type="button"
                className="self-start text-xs text-accent hover:underline"
                onClick={() => openUrlInBrowserTab(server.homepage!)}
              >
                Homepage
              </button>
            )}
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
