import { useMobileSettingsStore } from '@/stores/mobileSettingsStore'
import { Toggle } from '@/components/ui/Toggle'

export function MobileSettingsPage() {
  const enabled = useMobileSettingsStore((s) => s.enabled)
  const setEnabled = useMobileSettingsStore((s) => s.setEnabled)

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Mobile</h1>
      <p className="text-sm text-fg-muted mb-8">
        Preview your app on a phone by pairing it to this project over the LAN.
      </p>

      <div className="grid grid-cols-1 gap-6 max-w-lg">
        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-5">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            General
          </h2>

          <Toggle
            label="Enable Mobile Display"
            description="Adds a phone icon to the activity bar for pairing devices via QR code."
            checked={enabled}
            onChange={setEnabled}
          />
        </section>
      </div>
    </div>
  )
}
