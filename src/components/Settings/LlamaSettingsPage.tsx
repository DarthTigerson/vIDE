import { useEffect, useState } from 'react'
import { useLlamaSettingsStore } from '@/stores/llamaSettingsStore'
import { useLlamaStore } from '@/stores/llamaStore'
import { Switch } from '@/components/ui/Toggle'
import { formatMemory } from '@/lib/memoryBreakdown'
import { FeatureBlock, SettingRow } from './FeatureBlock'

type InstallInfo = Awaited<ReturnType<typeof window.api.llamaGetInstall>>

const primaryButton = 'shrink-0 whitespace-nowrap rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-40'

// Where llama.cpp comes from: the user's own install (Homebrew, a build on
// PATH) if there is one, else one click puts vIDE's pinned build in place, the
// same copy autocomplete runs, so nobody needs Homebrew or a terminal.
function LlamaInstallRow() {
  const [info, setInfo] = useState<InstallInfo | null>(null)
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.llamaGetInstall().then(setInfo).catch(() => {})
  }, [])

  const install = async () => {
    setError(null)
    setPercent(0)
    const unsubscribe = window.api.onLlamaInstallProgress((received, total) => {
      setPercent(total > 0 ? Math.floor((received / total) * 100) : 0)
    })
    try {
      const result = await window.api.llamaInstall()
      if (result.ok) {
        setInfo(await window.api.llamaGetInstall())
        // The Llama panel stops showing its "llama.cpp isn't installed" state.
        useLlamaStore.setState({ available: true })
      } else {
        setError(result.error)
      }
    } finally {
      unsubscribe()
      setPercent(null)
    }
  }

  if (!info) return null

  if (info.path) {
    return (
      // Stacked: the path is far wider than the row, and beside the label it
      // squeezed "Installed by vIDE." into one word per line.
      <SettingRow label="llama.cpp" description={info.source === 'vide' ? 'Installed by vIDE.' : 'Found on this machine.'} stacked>
        <span className="block break-all font-mono text-xs text-fg-subtle">{info.path}</span>
      </SettingRow>
    )
  }

  const size = info.downloadBytes ? ` (${formatMemory(info.downloadBytes)})` : ''
  return (
    <SettingRow
      label="llama.cpp"
      description={error ?? 'Not installed. vIDE can download the official llama.cpp build for you, no Homebrew needed.'}
    >
      {percent !== null
        ? <button type="button" className={primaryButton} disabled>Installing… {percent}%</button>
        : <button type="button" className={primaryButton} onClick={install}>{error ? 'Retry' : `Install llama.cpp${size}`}</button>}
    </SettingRow>
  )
}

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
          <LlamaInstallRow />
          <SettingRow label="Agent mode on launch" description="Start in agent mode when switching to a Llama model.">
            <Switch label="Agent Mode on Launch" checked={agentModeOnLaunch} onChange={setAgentModeOnLaunch} />
          </SettingRow>
        </FeatureBlock>
      </div>
    </div>
  )
}
