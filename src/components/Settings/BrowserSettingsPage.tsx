import { useBrowserSettingsStore } from '@/stores/browserSettingsStore'
import { useBrowserMcpStore } from '@/stores/browserMcpStore'
import { Toggle } from '@/components/ui/Toggle'

function Field({ id, label, value, onChange }: {
  id: string; label: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-fg">{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="h-8 px-2 text-sm text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
      />
    </div>
  )
}

export function BrowserSettingsPage() {
  const defaultUrl = useBrowserSettingsStore((s) => s.defaultUrl)
  const setDefaultUrl = useBrowserSettingsStore((s) => s.setDefaultUrl)

  const mcpEnabled = useBrowserMcpStore((s) => s.enabled)
  const mcpPending = useBrowserMcpStore((s) => s.pending)
  const mcpError = useBrowserMcpStore((s) => s.error)
  const setMcpEnabled = useBrowserMcpStore((s) => s.setEnabled)

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Browser</h1>
      <p className="text-sm text-fg-muted mb-8">Settings for the embedded browser tab.</p>

      <div className="grid grid-cols-1 gap-6 max-w-lg">
        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-5">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            New Tab
          </h2>

          <Field id="browser-default-url" label="Default URL" value={defaultUrl} onChange={setDefaultUrl} />
        </section>

        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-3">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            Claude Code
          </h2>

          <Toggle
            label="Let Claude drive a browser tab"
            description="Registers an MCP server (claude mcp, user scope) so Claude Code can navigate, click, type, screenshot, and read console logs in a dedicated browser tab — a built-in alternative to a separate browser-automation extension. Never touches tabs you have open yourself."
            checked={mcpEnabled}
            onChange={(value) => void setMcpEnabled(value)}
            disabled={mcpPending}
          />
          {mcpError && <p className="text-xs text-red-500">{mcpError}</p>}
        </section>
      </div>
    </div>
  )
}
