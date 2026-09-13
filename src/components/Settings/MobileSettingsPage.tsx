import { useMobileSettingsStore } from '@/stores/mobileSettingsStore'
import type { MobileDefaultMode } from '@/stores/mobileSettingsStore'
import { Toggle } from '@/components/ui/Toggle'
import { RadioGroup } from '@/components/ui/RadioGroup'
import { Section, Row } from './SettingsLayout'

const DEFAULT_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: 'ask', label: 'Ask each time' },
  { value: 'graph', label: 'Graph Display' },
  { value: 'vide', label: 'vIDE' },
]

export function MobileSettingsPage() {
  const enabled = useMobileSettingsStore((s) => s.enabled)
  const setEnabled = useMobileSettingsStore((s) => s.setEnabled)
  const defaultMode = useMobileSettingsStore((s) => s.defaultMode)
  const setDefaultMode = useMobileSettingsStore((s) => s.setDefaultMode)

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Mobile</h1>
      <p className="text-sm text-fg-muted mb-4">
        Preview your app on a phone by pairing it to this project over the LAN.
      </p>

      <Section label="General">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Enable Mobile Display"
            description="Adds a phone icon to the activity bar for pairing devices via QR code."
            checked={enabled}
            onChange={setEnabled}
          />
        </Row>
        <Row>
          <div className="flex items-center justify-between gap-4 max-w-[60ch]">
            <div>
              <div className="text-sm text-fg">Default mode after pairing</div>
              <div className="text-xs text-fg-muted mt-0.5">
                Skip straight to Graph Display or vIDE instead of showing the chooser. A
                "Switch mode" link on the page always leads back to it.
              </div>
            </div>
            <RadioGroup
              ariaLabel="Default mode after pairing"
              value={defaultMode ?? 'ask'}
              onChange={(value: string) => setDefaultMode(value === 'ask' ? null : value as MobileDefaultMode)}
              options={DEFAULT_MODE_OPTIONS}
            />
          </div>
        </Row>
      </Section>
    </div>
  )
}
