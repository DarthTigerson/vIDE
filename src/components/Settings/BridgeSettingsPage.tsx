import { useState } from 'react'
import { useModelSettingsStore } from '@/stores/modelSettingsStore'
import { useBridgeSettingsStore } from '@/stores/bridgeSettingsStore'
import { Toggle } from '@/components/ui/Toggle'

function Field({ id, label, value, onChange, type = 'text' }: {
  id: string; label: string; value: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-fg">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 px-2 text-sm text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
      />
    </div>
  )
}

function BridgeConnectionSection() {
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
    <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-5">
      <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Connection</h2>

      <Field id="bridge-endpoint" label="Endpoint" value={endpoint} onChange={setEndpoint} />
      <Field id="bridge-apikey" label="API Key" value={apiKey} onChange={setApiKey} />
      <Field id="bridge-model" label="Model ID" value={modelId} onChange={setModelId} />

      <div className="flex items-center gap-3">
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
    </section>
  )
}

export function BridgeSettingsPage() {
  const bridgeEnabled = useModelSettingsStore((s) => s.enabled.bridge)
  const setModelEnabled = useModelSettingsStore((s) => s.setEnabled)

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Bridge</h1>
      <p className="text-sm text-fg-muted mb-8">Any OpenAI-compatible local LLM endpoint.</p>

      <div className="grid grid-cols-1 gap-6 max-w-lg">
        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-5">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            General
          </h2>

          <Toggle
            label="Bridge"
            description="Show Bridge in the model dropdown."
            checked={bridgeEnabled}
            onChange={(value) => setModelEnabled('bridge', value)}
          />
        </section>

        {bridgeEnabled && <BridgeConnectionSection />}
      </div>
    </div>
  )
}
