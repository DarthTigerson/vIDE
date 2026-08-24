import { useEffect, useState } from 'react'
import { useModelSettingsStore } from '@/stores/modelSettingsStore'
import { Toggle } from '@/components/ui/Toggle'
import { openUrlInBrowserTab } from '@/components/Chat/terminalLinks'
import type { AssistantKind } from '@/types/api'

type CliState = 'checking' | 'found' | 'missing'

const MODEL_TOGGLES: Array<{
  id: AssistantKind
  label: string
  description: string
  cli?: { bin: string; installUrl: string }
}> = [
  {
    id: 'claude',
    label: 'Claude',
    description: 'Claude Code CLI, run as a terminal panel.',
    cli: { bin: 'claude', installUrl: 'https://docs.claude.com/en/docs/claude-code/setup' },
  },
  {
    id: 'codex',
    label: 'Codex',
    description: 'OpenAI Codex CLI, run as a terminal panel.',
    cli: { bin: 'codex', installUrl: 'https://github.com/openai/codex' },
  },
  { id: 'bridge', label: 'Bridge', description: 'Any OpenAI-compatible local LLM endpoint.' },
]

export function AssistantsStep() {
  const enabledModels = useModelSettingsStore((s) => s.enabled)
  const setModelEnabled = useModelSettingsStore((s) => s.setEnabled)
  const [cliStatus, setCliStatus] = useState<Record<string, CliState>>({ claude: 'checking', codex: 'checking' })

  const runCliCheck = () => {
    setCliStatus({ claude: 'checking', codex: 'checking' })
    for (const model of MODEL_TOGGLES) {
      if (!model.cli) continue
      const bin = model.cli.bin
      window.api.onboardingDetectCli(bin).then((found) => {
        setCliStatus((prev) => ({ ...prev, [bin]: found ? 'found' : 'missing' }))
      })
    }
  }

  useEffect(runCliCheck, [])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-fg">Which LLM model?</h2>
        <p className="text-xs text-fg-muted mt-0.5">
          Controls what shows up in the assistant dropdown. vIDE launches Claude/Codex as terminal
          processes rather than bundling them, so they need to be installed and on your PATH
          separately — checked below. Change any of this anytime in Settings → Models.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {MODEL_TOGGLES.map((model) => (
          <div key={model.id} className="flex flex-col gap-1.5">
            <Toggle
              label={model.label}
              description={model.description}
              checked={enabledModels[model.id]}
              onChange={(value) => setModelEnabled(model.id, value)}
            />
            {model.cli && (
              <div className="pl-0.5 text-xs">
                {cliStatus[model.cli.bin] === 'checking' && (
                  <span className="text-fg-muted">Checking for the CLI on your PATH…</span>
                )}
                {cliStatus[model.cli.bin] === 'found' && (
                  <span className="text-green-500">✓ CLI found on PATH</span>
                )}
                {cliStatus[model.cli.bin] === 'missing' && (
                  <button
                    type="button"
                    onClick={() => openUrlInBrowserTab(model.cli!.installUrl)}
                    className="text-accent hover:underline cursor-pointer"
                  >
                    CLI not found — install docs
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={runCliCheck}
        className="self-start h-7 px-2.5 rounded border border-border text-xs text-fg-muted hover:text-fg hover:border-fg-subtle transition-colors"
      >
        Re-check CLIs
      </button>
    </div>
  )
}
