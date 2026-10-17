import { useScriptsSettingsStore } from '@/stores/scriptsSettingsStore'
import { useScriptsMcpStore } from '@/stores/scriptsMcpStore'
import { FeatureBlock } from './FeatureBlock'

export function ScriptsSettingsPage() {
  const enabled = useScriptsSettingsStore((s) => s.enabled)
  const setEnabled = useScriptsSettingsStore((s) => s.setEnabled)

  const mcpEnabled = useScriptsMcpStore((s) => s.enabled)
  const mcpPending = useScriptsMcpStore((s) => s.pending)
  const mcpError = useScriptsMcpStore((s) => s.error)
  const setMcpEnabled = useScriptsMcpStore((s) => s.setEnabled)

  return (
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">Scripts</h1>
        <p className="mb-4 text-sm text-fg-muted">Saved shell routines with a title and description, run in a terminal from the Scripts panel, a terminal's right-click menu, or the Action Palette.</p>

        <FeatureBlock
          title="Scripts"
          description="Adds a Scripts app and a Scripts submenu to terminal right-click menus."
          toggle={{ checked: enabled, onChange: setEnabled, label: 'Enable Scripts' }}
        />

        <FeatureBlock
          title="Claude Code"
          description="Lets Claude Code list, read, create and update your scripts from any session, and run them in a new terminal tab from a Claude panel inside vIDE, through an MCP server (claude mcp, user scope). Claude gets a script's output only when its “Share output with Claude” switch is on; otherwise just success or failure. Claude cannot delete scripts."
          toggle={{ checked: mcpEnabled, onChange: (value) => void setMcpEnabled(value), label: 'Let Claude see & run your scripts', disabled: mcpPending }}
        >
          {mcpError && <p className="text-xs text-red-500">{mcpError}</p>}
        </FeatureBlock>
      </div>
    </div>
  )
}
