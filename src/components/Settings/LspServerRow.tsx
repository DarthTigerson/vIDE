import { Switch } from '@/components/ui/Toggle'
import { useLspSettingsStore, type LspServerId } from '@/stores/lspSettingsStore'
import { useLspStatusStore } from '@/stores/lspStatusStore'

// Same two button styles the other settings pages use (LlamaSettingsPage,
// ToolInstallRow) — accent-filled for the primary install, bordered for the
// lower-stakes reinstall of an already-present server.
const primaryButton =
  'shrink-0 whitespace-nowrap rounded-lg bg-accent px-3 py-1 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40'
const secondaryButton =
  'shrink-0 whitespace-nowrap rounded-lg border border-border px-3 py-1 text-sm text-fg transition-colors hover:border-fg-subtle disabled:opacity-40'

// One language's row in the Go-to-definition table (EditorSettingsPage). The
// streamed install output, when there is any, drops into a full-width row
// right under this one so it never squeezes the columns.
export function LspServerRow({ id }: { id: LspServerId }) {
  const enabled = useLspSettingsStore((s) => s.enabled[id])
  const setEnabled = useLspSettingsStore((s) => s.setEnabled)
  const status = useLspStatusStore((s) => s.status[id])
  const loaded = useLspStatusStore((s) => s.loaded)
  const installing = useLspStatusStore((s) => s.installing[id] ?? false)
  const output = useLspStatusStore((s) => s.installOutput[id])
  const install = useLspStatusStore((s) => s.install)

  const label = status?.label ?? id
  const ramEstimate = status?.ramEstimate
  const found = status?.found ?? false

  const statusText = !loaded
    ? 'Checking…'
    : installing
      ? 'Installing…'
      : found
        ? (status?.version ?? 'Installed')
        : 'Not installed'

  return (
    <>
      <tr className="border-t border-white/5 [&>td]:align-middle">
        <td className="py-2.5 pr-4 text-sm text-fg">{label}</td>
        <td className="py-2.5 pr-4 text-sm text-fg-muted">{statusText}</td>
        <td className="py-2.5 pr-4 font-mono text-xs text-fg-muted">{ramEstimate ?? '—'}</td>
        <td className="py-2.5 pr-4">
          <div className="flex justify-end">
            <Switch label={label} checked={enabled ?? false} onChange={(v) => setEnabled(id, v)} />
          </div>
        </td>
        <td className="py-2.5">
          <div className="flex justify-end">
            {loaded && (
              <button
                type="button"
                className={found ? secondaryButton : primaryButton}
                disabled={installing}
                onClick={() => install(id)}
              >
                {installing ? 'Installing…' : found ? 'Reinstall' : 'Install'}
              </button>
            )}
          </div>
        </td>
      </tr>

      {output !== undefined && output.length > 0 && (
        <tr>
          <td colSpan={5} className="pb-3">
            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-border p-2 text-xs text-fg-muted">
              {output}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
