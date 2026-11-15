import { useBrowserSettingsStore } from '@/stores/browserSettingsStore'
import { useBrowserMcpStore } from '@/stores/browserMcpStore'
import { Switch } from '@/components/ui/Toggle'
import { FeatureBlock, SettingRow } from './FeatureBlock'

export function BrowserSettingsPage() {
  const closeSidePanelOnOpen = useBrowserSettingsStore((s) => s.closeSidePanelOnOpen)
  const setCloseSidePanelOnOpen = useBrowserSettingsStore((s) => s.setCloseSidePanelOnOpen)

  const mcpEnabled = useBrowserMcpStore((s) => s.enabled)
  const mcpPending = useBrowserMcpStore((s) => s.pending)
  const mcpError = useBrowserMcpStore((s) => s.error)
  const setMcpEnabled = useBrowserMcpStore((s) => s.setEnabled)

  return (
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">Browser</h1>
        <p className="mb-4 text-sm text-fg-muted">Settings for the embedded browser tab.</p>

        <FeatureBlock title="New browser tabs" description="What happens when you open a browser tab.">
          <SettingRow label="Close side panel when opening" description="Give the page the full width.">
            <Switch label="Close side panel when opening" checked={closeSidePanelOnOpen} onChange={setCloseSidePanelOnOpen} />
          </SettingRow>
        </FeatureBlock>

        <FeatureBlock
          title="Claude Code"
          description="Lets Claude Code navigate, click, type, screenshot and read console logs in a dedicated browser tab, through an MCP server (claude mcp, user scope). A built-in alternative to a browser-automation extension; never touches tabs you have open yourself."
          toggle={{ checked: mcpEnabled, onChange: (value) => void setMcpEnabled(value), label: 'Let Claude drive a browser tab', disabled: mcpPending }}
        >
          {mcpError && <p className="text-xs text-red-500">{mcpError}</p>}
        </FeatureBlock>
      </div>
    </div>
  )
}
