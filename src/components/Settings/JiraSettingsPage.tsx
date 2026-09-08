import { useJiraSettingsStore } from '@/stores/jiraSettingsStore'
import { useFileStore } from '@/stores/fileStore'
import { Toggle } from '@/components/ui/Toggle'
import { Section, Row, TextField } from './SettingsLayout'

export function JiraSettingsPage() {
  const enabled = useJiraSettingsStore((s) => s.enabled)
  const setEnabled = useJiraSettingsStore((s) => s.setEnabled)
  const externalUrl = useJiraSettingsStore((s) => s.externalUrl)
  const setExternalUrl = useJiraSettingsStore((s) => s.setExternalUrl)
  const projectUrls = useJiraSettingsStore((s) => s.projectUrls)
  const setProjectUrl = useJiraSettingsStore((s) => s.setProjectUrl)
  const closeSidePanelOnOpen = useJiraSettingsStore((s) => s.closeSidePanelOnOpen)
  const setCloseSidePanelOnOpen = useJiraSettingsStore((s) => s.setCloseSidePanelOnOpen)
  const openInBiggestPane = useJiraSettingsStore((s) => s.openInBiggestPane)
  const setOpenInBiggestPane = useJiraSettingsStore((s) => s.setOpenInBiggestPane)
  const projectRoot = useFileStore((s) => s.projectRoot)

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Jira</h1>
      <p className="text-sm text-fg-muted mb-4">
        Point the Jira icon at your team's Jira instance and it'll open as a
        browser tab.
      </p>

      <Section label="General">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Enable Jira"
            description="Show the Jira icon in the activity bar. Requires a URL below too — the icon only appears once both are set."
            checked={enabled}
            onChange={setEnabled}
          />
        </Row>

        <Row>
          <TextField
            id="jira-external-url"
            label="Default URL"
            value={externalUrl}
            onChange={setExternalUrl}
            placeholder="https://your-team.atlassian.net"
            className="flex flex-col gap-1.5 max-w-md"
          />

          {projectRoot && (
            <TextField
              id="jira-project-url"
              label="This project's URL"
              value={projectUrls[projectRoot] ?? ''}
              onChange={(v) => setProjectUrl(projectRoot, v)}
              placeholder={externalUrl || 'Same as default URL above'}
              className="mt-3 flex flex-col gap-1.5 max-w-md"
            />
          )}

          <div className="mt-3 flex flex-col gap-3">
            <Toggle
              className="max-w-[60ch]"
              label="Close side panel when opening"
              description="Collapse the currently open sidebar (Files, Git, etc.) when jumping to the Jira browser tab, to give it the full width."
              checked={closeSidePanelOnOpen}
              onChange={setCloseSidePanelOnOpen}
            />
            <Toggle
              className="max-w-[60ch]"
              label="Always open in biggest window"
              description="If the editor is split into multiple panes, open the Jira browser tab in whichever pane currently has the most space, instead of the focused one."
              checked={openInBiggestPane}
              onChange={setOpenInBiggestPane}
            />
          </div>
        </Row>
      </Section>
    </div>
  )
}
