import type { LanguageServerEntry } from '@/types/api'
import { useEditorStore } from '@/stores/editorStore'
import { buildStoreServerPath } from '@/components/Settings/paths'
import { AppMonogram } from './storeUi'
import { ByAuthor, LanguageServerAction, useServerVersion } from './LanguageServerAction'

// One language server in the Store list, laid out like StoreAppRow: clicking
// the row opens its page (install source, memory, languages, install output).
export function LanguageServerRow({ server }: { server: LanguageServerEntry }) {
  const { version } = useServerVersion(server)
  const openTab = useEditorStore((s) => s.openTab)
  const open = () => openTab({ path: buildStoreServerPath(server.id), content: '', dirty: false })
  return (
    <article
      className="bg-panel border border-border rounded-[10px] px-4 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0 cursor-pointer hover:border-accent/45 transition-colors"
      onClick={open}
    >
      <AppMonogram name={server.name} />
      <div className="flex-[1_1_260px] min-w-0 flex flex-col gap-0.5">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h2 className="text-sm font-semibold text-fg truncate">{server.name}</h2>
          <ByAuthor author={server.author} />
        </div>
        <p className="text-xs text-fg-muted leading-relaxed">{server.description}</p>
      </div>
      {version && <span className="text-[0.6875rem] text-fg-subtle text-right">{version}</span>}
      <LanguageServerAction server={server} />
    </article>
  )
}
