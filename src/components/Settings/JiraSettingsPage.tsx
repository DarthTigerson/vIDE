import { useJiraSettingsStore } from '@/stores/jiraSettingsStore'
import { useFileStore } from '@/stores/fileStore'
import { Toggle } from '@/components/ui/Toggle'

function Field({ id, label, value, onChange, placeholder }: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-fg">{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="h-8 px-2 text-sm text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
      />
    </div>
  )
}

export function JiraSettingsPage() {
  const enabled = useJiraSettingsStore((s) => s.enabled)
  const setEnabled = useJiraSettingsStore((s) => s.setEnabled)
  const externalUrl = useJiraSettingsStore((s) => s.externalUrl)
  const setExternalUrl = useJiraSettingsStore((s) => s.setExternalUrl)
  const projectUrls = useJiraSettingsStore((s) => s.projectUrls)
  const setProjectUrl = useJiraSettingsStore((s) => s.setProjectUrl)
  const closeSidePanelOnOpen = useJiraSettingsStore((s) => s.closeSidePanelOnOpen)
  const setCloseSidePanelOnOpen = useJiraSettingsStore((s) => s.setCloseSidePanelOnOpen)
  const projectRoot = useFileStore((s) => s.projectRoot)

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Jira</h1>
      <p className="text-sm text-fg-muted mb-8">
        Point the Jira icon at your team's Jira instance and it'll open as a
        browser tab.
      </p>

      <div className="grid grid-cols-1 gap-6 max-w-lg">
        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-5">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            General
          </h2>

          <Toggle
            label="Enable Jira"
            description="Show the Jira icon in the activity bar. Requires a URL below too — the icon only appears once both are set."
            checked={enabled}
            onChange={setEnabled}
          />

          <Field
            id="jira-external-url"
            label="Default URL"
            value={externalUrl}
            onChange={setExternalUrl}
            placeholder="https://your-team.atlassian.net"
          />

          {projectRoot && (
            <Field
              id="jira-project-url"
              label="This project's URL"
              value={projectUrls[projectRoot] ?? ''}
              onChange={(v) => setProjectUrl(projectRoot, v)}
              placeholder={externalUrl || 'Same as default URL above'}
            />
          )}

          <Toggle
            label="Close side panel when opening"
            description="Collapse the currently open sidebar (Files, Git, etc.) when jumping to the Jira browser tab, to give it the full width."
            checked={closeSidePanelOnOpen}
            onChange={setCloseSidePanelOnOpen}
          />
        </section>
      </div>
    </div>
  )
}
