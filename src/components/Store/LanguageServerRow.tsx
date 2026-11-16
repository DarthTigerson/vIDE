import type { LanguageServerEntry } from '@/types/api'
import { isInstalled, useLspStatusStore } from '@/stores/lspStatusStore'
import { installSourceText } from '@/lib/lspInstallSource'
import { accentSolidColor } from '@/components/ui/pillButton'
import { AppMonogram, ghostPillClass } from './storeUi'

const installPillClass = `h-7 px-3.5 rounded-full text-[0.6875rem] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${accentSolidColor}`

// One language server in the Store's Language servers category. It shows
// exactly where the server comes from before install (the npm/go command or
// the GitHub repo), streams the install output underneath while it runs,
// and keeps that output on screen when an install fails.
export function LanguageServerRow({ server }: { server: LanguageServerEntry }) {
  const installed = useLspStatusStore((s) => isInstalled(s.installed, server.id))
  const installing = useLspStatusStore((s) => s.installing[server.id] ?? false)
  const failed = useLspStatusStore((s) => s.installFailed[server.id] ?? false)
  const output = useLspStatusStore((s) => s.installOutput[server.id] ?? '')
  const install = useLspStatusStore((s) => s.install)
  const uninstall = useLspStatusStore((s) => s.uninstall)

  return (
    <article className="bg-panel border border-border rounded-[10px] px-4 py-3.5 flex flex-col gap-2 min-w-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0">
        <AppMonogram name={server.name} />
        <div className="flex-[1_1_260px] min-w-0 flex flex-col gap-0.5">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <h2 className="text-sm font-semibold text-fg truncate">{server.name}</h2>
            <span className="text-[0.6875rem] text-fg-subtle shrink-0">Language server</span>
          </div>
          <p className="text-xs text-fg-muted leading-relaxed">{server.description}</p>
          <p className="font-mono text-[0.6875rem] text-fg-subtle [overflow-wrap:anywhere]" title="Where vIDE installs it from">
            {installSourceText(server.install)}
          </p>
        </div>
        {server.ramEstimate && (
          <span className="text-[0.6875rem] text-fg-subtle text-right max-w-[160px]">{server.ramEstimate}</span>
        )}
        {installed && !installing ? (
          <button type="button" className={ghostPillClass} onClick={() => void uninstall(server.id)}>Remove</button>
        ) : (
          <button type="button" className={installPillClass} disabled={installing} onClick={() => void install(server.id)}>
            {installing ? 'Installing…' : failed ? 'Retry' : 'Install'}
          </button>
        )}
      </div>
      {(installing || failed) && output.length > 0 && (
        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-border p-2 text-[0.6875rem] text-fg-muted">
          {output}
        </pre>
      )}
    </article>
  )
}
