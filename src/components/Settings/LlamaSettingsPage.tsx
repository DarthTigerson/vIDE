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
          <SettingRow label="Agent mode on launch" description="Start in agent mode when switching to a Llama model.">
            <Switch label="Agent Mode on Launch" checked={agentModeOnLaunch} onChange={setAgentModeOnLaunch} />
          </SettingRow>
        </FeatureBlock>
      </div>
    </div>
  )
}
