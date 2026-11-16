import { Switch } from '@/components/ui/Toggle'
import { useLspSettingsStore, useServerEnabled } from '@/stores/lspSettingsStore'
import { useLspStatusStore } from '@/stores/lspStatusStore'
import type { InstalledServerInfo } from '@/types/api'

const secondaryButton =
  'shrink-0 whitespace-nowrap rounded-lg border border-border px-3 py-1 text-sm text-fg transition-colors hover:border-fg-subtle disabled:opacity-40'

// One installed language server in the Go-to-definition table
// (EditorSettingsPage). Installing happens in the Store; here it can be
// switched off or removed from vIDE (the binary itself stays on the machine).
export function LspServerRow({ server }: { server: InstalledServerInfo }) {
  const { entry } = server
  const enabled = useServerEnabled(entry.id)
  const setEnabled = useLspSettingsStore((s) => s.setEnabled)
  const uninstall = useLspStatusStore((s) => s.uninstall)

  const statusText = server.found ? (server.version ?? 'Installed') : 'Binary missing — reinstall from the Store'

  return (
    <tr className="border-t border-white/5 [&>td]:align-middle">
      <td className="py-2.5 pr-4 text-sm text-fg">{entry.name}</td>
      <td className="py-2.5 pr-4 text-sm text-fg-muted">{statusText}</td>
      <td className="py-2.5 pr-4 font-mono text-xs text-fg-muted">{entry.ramEstimate ?? '—'}</td>
      <td className="py-2.5 pr-4">
        <div className="flex justify-end">
          <Switch label={entry.name} checked={enabled} onChange={(v) => setEnabled(entry.id, v)} />
        </div>
      </td>
      <td className="py-2.5">
        <div className="flex justify-end">
          <button type="button" className={secondaryButton} onClick={() => void uninstall(entry.id)}>
            Remove
          </button>
        </div>
      </td>
    </tr>
  )
}
