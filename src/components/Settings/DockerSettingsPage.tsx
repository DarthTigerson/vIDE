import { useDockerSettingsStore, type DockerBadgeMode } from '@/stores/dockerSettingsStore'
import { Toggle } from '@/components/ui/Toggle'
import { Select } from '@/components/ui/Select'

export function DockerSettingsPage() {
  const enabled = useDockerSettingsStore((s) => s.enabled)
  const setEnabled = useDockerSettingsStore((s) => s.setEnabled)
  const showBadge = useDockerSettingsStore((s) => s.showBadge)
  const setShowBadge = useDockerSettingsStore((s) => s.setShowBadge)
  const badgeMode = useDockerSettingsStore((s) => s.badgeMode)
  const setBadgeMode = useDockerSettingsStore((s) => s.setBadgeMode)

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Docker</h1>
      <p className="text-sm text-fg-muted mb-8">
        See and control local Docker containers without leaving vIDE.
      </p>

      <div className="grid grid-cols-1 gap-6 max-w-lg">
        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-5">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            General
          </h2>

          <Toggle
            label="Enable Docker"
            description="Adds a Docker icon to the activity bar with a live container panel and per-container logs."
            checked={enabled}
            onChange={setEnabled}
          />

          <Toggle
            label="Show running count"
            description="Adds a badge with a live count to the Docker icon in the activity bar, kept up to date even while the panel is closed."
            checked={showBadge}
            onChange={setShowBadge}
          />

          {showBadge && (
            <div className="pl-1">
              <label htmlFor="docker-badge-mode" className="text-xs text-fg-muted mb-1.5 block">
                Count
              </label>
              <Select
                id="docker-badge-mode"
                value={badgeMode}
                onChange={(v) => setBadgeMode(v as DockerBadgeMode)}
                options={[
                  { value: 'containers', label: 'All running containers' },
                  { value: 'projects', label: 'All running projects' },
                ]}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
