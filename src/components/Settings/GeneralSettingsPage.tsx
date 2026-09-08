import { useState } from 'react'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { useGeneralSettingsStore } from '@/stores/generalSettingsStore'
import { Toggle } from '@/components/ui/Toggle'
import { Section, Row } from './SettingsLayout'

export function GeneralSettingsPage() {
  const [replaying, setReplaying] = useState(false)
  const openInBiggestPane = useGeneralSettingsStore((s) => s.openInBiggestPane)
  const setOpenInBiggestPane = useGeneralSettingsStore((s) => s.setOpenInBiggestPane)

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">General</h1>
      <p className="text-sm text-fg-muted mb-4">App-level setup and preferences.</p>

      <Section label="Settings">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Always open in biggest pane"
            description="If the editor is split into multiple panes, open any settings page in whichever pane currently has the most space, instead of the focused one."
            checked={openInBiggestPane}
            onChange={setOpenInBiggestPane}
          />
        </Row>
      </Section>

      <Section label="Setup Wizard">
        <Row>
          <p className="text-sm text-fg-muted mb-3">
            Re-run the first-launch setup wizard — theme, assistant selection, CLI check, git identity,
            and (on macOS) the Automation permission prompt.
          </p>
          <button
            type="button"
            disabled={replaying}
            onClick={() => {
              setReplaying(true)
              useOnboardingStore.getState().replay().finally(() => setReplaying(false))
            }}
            className="self-start h-8 px-3 rounded border border-border text-sm text-fg hover:border-fg-subtle transition-colors disabled:opacity-50"
          >
            Run Setup Wizard
          </button>
        </Row>
      </Section>
    </div>
  )
}
