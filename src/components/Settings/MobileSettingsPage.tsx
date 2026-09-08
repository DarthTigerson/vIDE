import { useMobileSettingsStore } from '@/stores/mobileSettingsStore'
import { Toggle } from '@/components/ui/Toggle'
import { Section, Row } from './SettingsLayout'

export function MobileSettingsPage() {
  const enabled = useMobileSettingsStore((s) => s.enabled)
  const setEnabled = useMobileSettingsStore((s) => s.setEnabled)

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
      </Section>
    </div>
  )
}
