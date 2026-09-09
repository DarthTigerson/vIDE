import { useBrowserSettingsStore } from '@/stores/browserSettingsStore'
import { useBrowserMcpStore } from '@/stores/browserMcpStore'
import { Toggle } from '@/components/ui/Toggle'
import { Section, Row } from './SettingsLayout'

export function BrowserSettingsPage() {
  const openInBiggestPane = useBrowserSettingsStore((s) => s.openInBiggestPane)
  const setOpenInBiggestPane = useBrowserSettingsStore((s) => s.setOpenInBiggestPane)
  const closeSidePanelOnOpen = useBrowserSettingsStore((s) => s.closeSidePanelOnOpen)
  const setCloseSidePanelOnOpen = useBrowserSettingsStore((s) => s.setCloseSidePanelOnOpen)

  const mcpEnabled = useBrowserMcpStore((s) => s.enabled)
  const mcpPending = useBrowserMcpStore((s) => s.pending)
  const mcpError = useBrowserMcpStore((s) => s.error)
  const setMcpEnabled = useBrowserMcpStore((s) => s.setEnabled)

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Browser</h1>
      <p className="text-sm text-fg-muted mb-4">Settings for the embedded browser tab.</p>

      <Section label="New Tab">
        <Row>
          <div className="flex flex-col gap-3">
            <Toggle
              className="max-w-[60ch]"
              label="Always open in biggest window"
              description="If the editor is split into multiple panes, open new browser tabs in whichever pane currently has the most space, instead of the focused one."
              checked={openInBiggestPane}
              onChange={setOpenInBiggestPane}
            />
            <Toggle
              className="max-w-[60ch]"
              label="Close side panel when opening"
              description="Collapse the currently open sidebar (Files, Git, etc.) when opening a new browser tab, to give it the full width."
              checked={closeSidePanelOnOpen}
              onChange={setCloseSidePanelOnOpen}
            />
          </div>
        </Row>
      </Section>

      <Section label="Claude Code">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Let Claude drive a browser tab"
            description="Registers an MCP server (claude mcp, user scope) so Claude Code can navigate, click, type, screenshot, and read console logs in a dedicated browser tab — a built-in alternative to a separate browser-automation extension. Never touches tabs you have open yourself."
            checked={mcpEnabled}
            onChange={(value) => void setMcpEnabled(value)}
            disabled={mcpPending}
          />
          {mcpError && <p className="text-xs text-red-500 mt-1">{mcpError}</p>}
        </Row>
      </Section>
    </div>
  )
}
