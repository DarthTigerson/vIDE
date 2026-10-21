import { useLlamaSettingsStore } from '@/stores/llamaSettingsStore'
import { useLlamaStore } from '@/stores/llamaStore'
import { Switch } from '@/components/ui/Toggle'
import { FeatureBlock, SettingRow } from './FeatureBlock'
import { ToolInstallRow } from './ToolInstallRow'

const getInstall = () => window.api.llamaGetInstall()
const install = () => window.api.llamaInstall()
const onProgress = (cb: (received: number, total: number) => void) => window.api.onLlamaInstallProgress(cb)
// The Llama panel stops showing its "llama.cpp isn't installed" state.
const onInstalled = () => useLlamaStore.setState({ available: true })

export function LlamaSettingsPage() {
  const enabled = useLlamaSettingsStore((s) => s.enabled)
  const setEnabled = useLlamaSettingsStore((s) => s.setEnabled)
  const agentModeOnLaunch = useLlamaSettingsStore((s) => s.agentModeOnLaunch)
  const setAgentModeOnLaunch = useLlamaSettingsStore((s) => s.setAgentModeOnLaunch)
  const toolCallLimit = useLlamaSettingsStore((s) => s.toolCallLimit)
  const setToolCallLimit = useLlamaSettingsStore((s) => s.setToolCallLimit)

  return (
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">Llama</h1>
        <p className="mb-4 text-sm text-fg-muted">Manage local LLMs (llama.cpp) without leaving vIDE.</p>

        <FeatureBlock
          title="Llama"
          description="Adds a Llama icon to the activity bar with a panel for local model controls."
          toggle={{ checked: enabled, onChange: setEnabled, label: 'Enable Llama' }}
        >
          <ToolInstallRow
            name="llama.cpp"
            notInstalled="Not installed. vIDE can download the official llama.cpp build for you, no Homebrew needed."
            getInstall={getInstall}
            install={install}
            onProgress={onProgress}
            onInstalled={onInstalled}
          />
        </FeatureBlock>

        <FeatureBlock title="Agent" description="How Llama models behave as an agent.">
          <fieldset disabled={!enabled} className={['m-0 min-w-0 border-0 p-0', enabled ? '' : 'opacity-50'].join(' ')}>
            <SettingRow label="Tool call limit" htmlFor="llama-toolCallLimit" description="0 = unlimited.">
              <input
                id="llama-toolCallLimit"
                type="number"
                min={0}
                step={1}
                value={toolCallLimit}
                onChange={(e) => setToolCallLimit(Math.max(0, Number(e.target.value)))}
                className="w-20 rounded-lg border border-border bg-bg px-2 py-1 text-sm text-fg focus:border-accent/60 focus:outline-none"
              />
            </SettingRow>
            <SettingRow label="Agent mode on launch" description="Start in agent mode when switching to a Llama model.">
              <Switch label="Agent Mode on Launch" checked={agentModeOnLaunch} onChange={setAgentModeOnLaunch} />
            </SettingRow>
          </fieldset>
        </FeatureBlock>
      </div>
    </div>
  )
}
