import type { LanguageServerEntry } from '@/types/api'
import { isInstalled, useLspStatusStore } from '@/stores/lspStatusStore'
import { accentSolidColor } from '@/components/ui/pillButton'
import { ghostPillClass } from './storeUi'

const solidPillClass = `h-7 px-3.5 rounded-full text-[0.6875rem] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${accentSolidColor}`

// Install / Installing… / Retry / Remove for one language server; used on its
// Store row and its page. Clicks never reach the row (which opens the page).
export function LanguageServerAction({ server }: { server: LanguageServerEntry }) {
  const installed = useLspStatusStore((s) => isInstalled(s.installed, server.id))
  const installing = useLspStatusStore((s) => s.installing[server.id] ?? false)
  const failed = useLspStatusStore((s) => s.installFailed[server.id] ?? false)
  const install = useLspStatusStore((s) => s.install)
  const uninstall = useLspStatusStore((s) => s.uninstall)
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn() }

  if (installed && !installing) {
    return <button type="button" className={ghostPillClass} onClick={stop(() => void uninstall(server.id))}>Remove</button>
  }
  return (
    <button type="button" className={solidPillClass} disabled={installing} onClick={stop(() => void install(server.id))}>
      {installing ? 'Installing…' : failed ? 'Retry' : 'Install'}
    </button>
  )
}

// The version to show: what is installed here, else upstream's newest
// release from the catalog, else nothing.
export function useServerVersion(server: LanguageServerEntry): { version: string | null; installed: string | null } {
  const installed = useLspStatusStore((s) => s.installed.find((i) => i.entry.id === server.id)?.version ?? null)
  return { version: installed ?? server.version ?? null, installed }
}

export function ByAuthor({ author }: { author?: string }) {
  return (
    <span className="text-[0.6875rem] text-fg-subtle truncate min-w-0">
      Language server{author ? ` · by ${author}` : ''}
    </span>
  )
}
