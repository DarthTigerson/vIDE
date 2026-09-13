import { useLlamaSettingsStore } from '@/stores/llamaSettingsStore'
import { Toggle } from '@/components/ui/Toggle'
import { Section, Row } from './SettingsLayout'

export function LlamaSettingsPage() {
  const enabled = useLlamaSettingsStore((s) => s.enabled)
  const setEnabled = useLlamaSettingsStore((s) => s.setEnabled)
  const agentModeOnLaunch = useLlamaSettingsStore((s) => s.agentModeOnLaunch)
  const setAgentModeOnLaunch = useLlamaSettingsStore((s) => s.setAgentModeOnLaunch)

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Llama</h1>
      <p className="text-sm text-fg-muted mb-4">
        Manage local LLMs (llama.cpp) without leaving vIDE.
      </p>

      <Section label="General">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Enable Llama"
            description="Adds a Llama icon to the activity bar with a panel for local model controls."
            checked={enabled}
            onChange={setEnabled}
          />
        </Row>
      </Section>

      {enabled && (
        <Section label="Agent">
          <Row>
            <Toggle
              className="max-w-[60ch]"
              label="Agent Mode on Launch"
              description="Start with agent mode enabled when switching to a Llama model."
              checked={agentModeOnLaunch}
              onChange={setAgentModeOnLaunch}
            />
          </Row>
        </Section>
      )}
    </div>
  )
}
