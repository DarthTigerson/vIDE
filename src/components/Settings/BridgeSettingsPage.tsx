import { useState } from 'react'
import { useModelSettingsStore } from '@/stores/modelSettingsStore'
import { useBridgeSettingsStore } from '@/stores/bridgeSettingsStore'
import { Switch } from '@/components/ui/Toggle'
import { TextField } from './SettingsLayout'
import { FeatureBlock, SettingRow } from './FeatureBlock'

export function BridgeSettingsPage() {
  const bridgeEnabled = useModelSettingsStore((s) => s.enabled.bridge)
  const setModelEnabled = useModelSettingsStore((s) => s.setEnabled)
  const { endpoint, apiKey, modelId, toolCallLimit, agentModeOnLaunch, setEndpoint, setApiKey, setModelId, setToolCallLimit, setAgentModeOnLaunch } = useBridgeSettingsStore()
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testError, setTestError] = useState('')

  const runTest = async () => {
    setTestState('testing')
    setTestError('')
    const result = await window.api.bridgeTestConnection({ endpoint, apiKey, modelId })
    if (result.ok) {
      setTestState('ok')
    } else {
      setTestState('error')
      setTestError(result.error ?? 'Unknown error')
    }
  }

  return (
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">Bridge</h1>
        <p className="mb-4 text-sm text-fg-muted">Any OpenAI-compatible local LLM endpoint.</p>

        <FeatureBlock
          title="Bridge"
          description="Show Bridge in the model dropdown, connected to the endpoint below."
          toggle={{ checked: bridgeEnabled, onChange: (value) => setModelEnabled('bridge', value), label: 'Bridge' }}
        >
          <TextField id="bridge-endpoint" label="Endpoint" value={endpoint} onChange={setEndpoint} className="flex max-w-[460px] flex-col gap-1.5 py-1.5" />
          <TextField id="bridge-apikey" label="API Key" value={apiKey} onChange={setApiKey} className="flex max-w-[460px] flex-col gap-1.5 py-1.5" />
          <TextField id="bridge-model" label="Model ID" value={modelId} onChange={setModelId} className="flex max-w-[460px] flex-col gap-1.5 py-1.5" />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={runTest}
              disabled={testState === 'testing'}
              className="h-8 rounded-sm border border-border px-3 text-sm text-fg transition-colors hover:border-fg-subtle disabled:opacity-50"
            >
              Test Connection
            </button>
            {testState === 'ok' && <span className="text-sm text-green-500">Connected</span>}
            {testState === 'error' && <span className="text-sm text-red-500">{testError}</span>}
          </div>
        </FeatureBlock>

        <FeatureBlock title="Agent" description="How Bridge behaves as an agent.">
          <fieldset disabled={!bridgeEnabled} className={['m-0 min-w-0 border-0 p-0', bridgeEnabled ? '' : 'opacity-50'].join(' ')}>
            <SettingRow label="Tool call limit" htmlFor="bridge-toolCallLimit" description="0 = unlimited.">
              <input
                id="bridge-toolCallLimit"
                type="number"
                min={0}
                step={1}
                value={toolCallLimit}
                onChange={(e) => setToolCallLimit(Math.max(0, Number(e.target.value)))}
                className="w-20 rounded-lg border border-border bg-bg px-2 py-1 text-sm text-fg focus:border-accent/60 focus:outline-hidden"
              />
            </SettingRow>
            <SettingRow label="Agent mode on launch" description="Start in agent mode each time Bridge opens.">
              <Switch label="Agent Mode on Launch" checked={agentModeOnLaunch} onChange={setAgentModeOnLaunch} />
            </SettingRow>
          </fieldset>
        </FeatureBlock>
      </div>
    </div>
  )
}
