import { useDockerSettingsStore, type DockerBadgeMode, type DockerMemoryFormat } from '@/stores/dockerSettingsStore'
import { Toggle } from '@/components/ui/Toggle'
import { Select } from '@/components/ui/Select'

export function DockerSettingsPage() {
  const enabled = useDockerSettingsStore((s) => s.enabled)
  const setEnabled = useDockerSettingsStore((s) => s.setEnabled)
  const showBadge = useDockerSettingsStore((s) => s.showBadge)
  const setShowBadge = useDockerSettingsStore((s) => s.setShowBadge)
  const badgeMode = useDockerSettingsStore((s) => s.badgeMode)
  const setBadgeMode = useDockerSettingsStore((s) => s.setBadgeMode)
  const showMemory = useDockerSettingsStore((s) => s.showMemory)
  const setShowMemory = useDockerSettingsStore((s) => s.setShowMemory)
  const memoryFormat = useDockerSettingsStore((s) => s.memoryFormat)
  const setMemoryFormat = useDockerSettingsStore((s) => s.setMemoryFormat)

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

        <section className="rounded-xl border border-border/60 p-4 flex flex-col gap-5">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
            Container Rows
          </h2>

          <Toggle
            label="Show memory usage"
            description="Adds each container's memory usage to its row. Uses docker stats, a noticeably heavier command than the container list itself, so this polls only while the panel is open."
            checked={showMemory}
            onChange={setShowMemory}
          />

          {showMemory && (
            <div className="pl-1">
              <label htmlFor="docker-memory-format" className="text-xs text-fg-muted mb-1.5 block">
                Format
              </label>
              <Select
                id="docker-memory-format"
                value={memoryFormat}
                onChange={(v) => setMemoryFormat(v as DockerMemoryFormat)}
                options={[
                  { value: 'usedPercent', label: 'Used %' },
                  { value: 'availablePercent', label: 'Available %' },
                  { value: 'usedAbsolute', label: 'Used (e.g. 512 MB)' },
                  { value: 'usedOverLimit', label: 'Used / limit (e.g. 512 MB / 1 GB)' },
                ]}
              />
              <p className="text-xs text-fg-subtle mt-1.5">
                A container with no explicit memory limit reports its limit as the host's total
                RAM, so "%" for one of those means share of the whole machine, not of a per-container ceiling.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
