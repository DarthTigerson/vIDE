import { useEffect, useState } from 'react'
import { useModelSettingsStore } from '@/stores/modelSettingsStore'
import { useAutocompleteSettingsStore, AUTOCOMPLETE_MODELS } from '@/stores/autocompleteSettingsStore'
import { useBridgeSettingsStore } from '@/stores/bridgeSettingsStore'
import { useInlineEditSettingsStore } from '@/stores/inlineEditSettingsStore'
import { useCommitMessageSettingsStore } from '@/stores/commitMessageSettingsStore'
import { useUsagePassiveSettingsStore } from '@/stores/usagePassiveSettingsStore'
import { useNotificationSoundSettingsStore, NOTIFICATION_SOUND_OPTIONS, playNotificationSound } from '@/stores/notificationSoundSettingsStore'
import { useEditorStore } from '@/stores/editorStore'
import { USAGE_GRAPH_TAB_PATH } from '@/components/Settings/paths'
import { Toggle } from '@/components/ui/Toggle'
import { Select } from '@/components/ui/Select'
import type { AssistantKind } from '@/types/api'

const MODEL_TOGGLES: Array<{ id: AssistantKind; label: string; description: string }> = [
  { id: 'claude', label: 'Claude', description: 'Show Claude Code in the model dropdown.' },
  { id: 'codex', label: 'Codex', description: 'Show Codex in the model dropdown.' },
  { id: 'bridge', label: 'Bridge', description: 'Show Bridge in the model dropdown.' },
]

function SpeakerIcon() {
  return (
    <svg
      className="shrink-0"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4 9.5V14.5H8L13 18.5V5.5L8 9.5H4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M16.5 8.5C17.5 9.5 18 10.7 18 12C18 13.3 17.5 14.5 16.5 15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M19 6C20.7 7.7 21.5 9.8 21.5 12C21.5 14.2 20.7 16.3 19 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

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
      <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Bridge</h2>

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

export function ModelsSettingsPage() {
  const enabledModels = useModelSettingsStore((s) => s.enabled)
  const setModelEnabled = useModelSettingsStore((s) => s.setEnabled)
  const autocompleteModel = useAutocompleteSettingsStore((s) => s.model)
  const setAutocompleteModel = useAutocompleteSettingsStore((s) => s.setModel)
  const inlineEditEnabled = useInlineEditSettingsStore((s) => s.enabled)
  const setInlineEditEnabled = useInlineEditSettingsStore((s) => s.setEnabled)
  const inlineEditModel = useInlineEditSettingsStore((s) => s.model)
  const setInlineEditModel = useInlineEditSettingsStore((s) => s.setModel)
  const passiveUsageEnabled = useUsagePassiveSettingsStore((s) => s.enabled)
  const setPassiveUsageEnabled = useUsagePassiveSettingsStore((s) => s.setEnabled)
  const commitMessageEnabled = useCommitMessageSettingsStore((s) => s.enabled)
  const setCommitMessageEnabled = useCommitMessageSettingsStore((s) => s.setEnabled)
  const commitMessageModel = useCommitMessageSettingsStore((s) => s.model)
  const setCommitMessageModel = useCommitMessageSettingsStore((s) => s.setModel)
  const commitMessagePrompt = useCommitMessageSettingsStore((s) => s.prompt)
  const setCommitMessagePrompt = useCommitMessageSettingsStore((s) => s.setPrompt)
  const notificationSoundEnabled = useNotificationSoundSettingsStore((s) => s.enabled)
  const setNotificationSoundEnabled = useNotificationSoundSettingsStore((s) => s.setEnabled)
  const notificationSoundId = useNotificationSoundSettingsStore((s) => s.soundId)
  const setNotificationSoundId = useNotificationSoundSettingsStore((s) => s.setSoundId)

  useEffect(() => {
    useUsagePassiveSettingsStore.getState().init()
  }, [])

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Models</h1>
      <p className="text-sm text-fg-muted mb-8">Assistants and model-powered features.</p>

      <div className="grid grid-cols-1 gap-6 max-w-lg">
        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-5">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            Assistants
          </h2>

          {MODEL_TOGGLES.map((model) => (
            <Toggle
              key={model.id}
              label={model.label}
              description={model.description}
              checked={enabledModels[model.id]}
              onChange={(value) => setModelEnabled(model.id, value)}
            />
          ))}
        </section>

        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-5">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            Notifications
          </h2>

          <Toggle
            label="Play sound when Claude is done"
            description="Plays a sound when Claude finishes responding. Claude only, for now."
            checked={notificationSoundEnabled}
            onChange={setNotificationSoundEnabled}
          />

          {notificationSoundEnabled && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label htmlFor="notification-sound-select" className="text-xs text-fg-muted mb-1.5 block">Sound</label>
                <Select
                  id="notification-sound-select"
                  value={notificationSoundId}
                  onChange={setNotificationSoundId}
                  options={NOTIFICATION_SOUND_OPTIONS.map((s) => ({ value: s.id, label: s.label }))}
                />
              </div>
              <button
                type="button"
                onClick={() => playNotificationSound(notificationSoundId)}
                aria-label="Test sound"
                title="Test sound"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-fg hover:border-fg-subtle transition-colors"
              >
                <SpeakerIcon />
              </button>
            </div>
          )}
        </section>

        {enabledModels.bridge && <BridgeConnectionSection />}

        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-5">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            Autocomplete
          </h2>

          <Toggle
            label="Inline Autocomplete"
            description="Temporarily disabled while we rework how this feature works (VIDE-16) — the current design has poor latency and burns subscription usage."
            checked={false}
            disabled
            onChange={() => {}}
          />

          <div>
            <label htmlFor="autocomplete-model" className="text-xs text-fg-muted mb-1.5 block">Model</label>
            <Select
              id="autocomplete-model"
              value={autocompleteModel}
              onChange={setAutocompleteModel}
              options={AUTOCOMPLETE_MODELS.map((m) => ({ value: m.id, label: m.label }))}
              disabled
            />
          </div>
        </section>

        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-5">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            Inline Edit
          </h2>

          <Toggle
            label="Inline Edit (Cmd+K)"
            description="Select code (or place your cursor) and press Cmd+K to describe a change."
            checked={inlineEditEnabled}
            onChange={setInlineEditEnabled}
          />

          <div>
            <label htmlFor="inline-edit-model" className="text-xs text-fg-muted mb-1.5 block">Inline Edit Model</label>
            <Select
              id="inline-edit-model"
              value={inlineEditModel}
              onChange={setInlineEditModel}
              options={AUTOCOMPLETE_MODELS.map((m) => ({ value: m.id, label: m.label }))}
            />
          </div>
        </section>

        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-5">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            Commit Messages
          </h2>

          <Toggle
            label="Generate commit messages"
            description="Adds a button next to the commit message box in the Git panel that writes a message from your staged diff."
            checked={commitMessageEnabled}
            onChange={setCommitMessageEnabled}
          />

          <div>
            <label htmlFor="commit-message-model" className="text-xs text-fg-muted mb-1.5 block">Commit Message Model</label>
            <Select
              id="commit-message-model"
              value={commitMessageModel}
              onChange={setCommitMessageModel}
              options={AUTOCOMPLETE_MODELS.map((m) => ({ value: m.id, label: m.label }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="commit-message-prompt" className="text-sm text-fg">Prompt</label>
            <textarea
              id="commit-message-prompt"
              value={commitMessagePrompt}
              onChange={(e) => setCommitMessagePrompt(e.target.value)}
              placeholder="Leave empty for the default prompt"
              rows={3}
              className="w-full resize-none px-2 py-1.5 text-sm text-fg bg-bg border border-border rounded-lg placeholder:text-fg-subtle focus:outline-none focus:border-accent/60"
            />
          </div>
        </section>

        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-5">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            Usage Monitoring
          </h2>

          <Toggle
            label="Passive usage monitoring"
            description="Track Claude Code usage continuously in the background, even when the usage panel and mobile display are closed. Off by default — usage is otherwise only tracked while one of those is open. History collected this way is viewable in the Usage Graph tab."
            checked={passiveUsageEnabled}
            onChange={setPassiveUsageEnabled}
          />

          <div>
            <button
              type="button"
              onClick={() => useEditorStore.getState().openTab({ path: USAGE_GRAPH_TAB_PATH, content: '', dirty: false })}
              className="h-8 px-3 rounded border border-border text-sm text-fg hover:border-fg-subtle transition-colors"
            >
              Open Usage Graph
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
