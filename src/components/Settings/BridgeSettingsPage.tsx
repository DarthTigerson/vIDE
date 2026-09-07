import { useState } from 'react'
import { useModelSettingsStore } from '@/stores/modelSettingsStore'
import { useBridgeSettingsStore } from '@/stores/bridgeSettingsStore'
import { Toggle } from '@/components/ui/Toggle'
import { Section, Row, Field } from './SettingsLayout'

function TextField({ id, label, value, onChange }: {
  id: string; label: string; value: string; onChange: (v: string) => void
}) {
  return (
    <Field label={label} htmlFor={id} className="w-72 shrink-0">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-8 px-2 text-sm text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
      />
    </Field>
  )
}

export function BridgeSettingsPage() {
  const bridgeEnabled = useModelSettingsStore((s) => s.enabled.bridge)
  const setModelEnabled = useModelSettingsStore((s) => s.setEnabled)
  const { endpoint, apiKey, modelId, setEndpoint, setApiKey, setModelId } = useBridgeSettingsStore()
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
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Bridge</h1>
      <p className="text-sm text-fg-muted mb-4">Any OpenAI-compatible local LLM endpoint.</p>

      <Section label="General">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Bridge"
            description="Show Bridge in the model dropdown."
            checked={bridgeEnabled}
            onChange={(value) => setModelEnabled('bridge', value)}
          />
        </Row>
      </Section>

      {bridgeEnabled && (
        <Section label="Connection">
          <Row>
            <TextField id="bridge-endpoint" label="Endpoint" value={endpoint} onChange={setEndpoint} />
            <TextField id="bridge-apikey" label="API Key" value={apiKey} onChange={setApiKey} />
            <TextField id="bridge-model" label="Model ID" value={modelId} onChange={setModelId} />

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={runTest}
                disabled={testState === 'testing'}
                className="h-8 px-3 rounded border border-border text-sm text-fg hover:border-fg-subtle transition-colors disabled:opacity-50"
              >
                Test Connection
              </button>
              {testState === 'ok' && <span className="text-sm text-green-500">Connected</span>}
              {testState === 'error' && <span className="text-sm text-red-500">{testError}</span>}
            </div>
          </Row>
        </Section>
      )}
    </div>
  )
}
