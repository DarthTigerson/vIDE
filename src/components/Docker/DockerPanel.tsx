import { useEffect, useMemo, useState } from 'react'
import { useDockerStore } from '@/stores/dockerStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildDockerLogsPath } from './paths'
import { ConfirmRemoveContainerModal } from './ConfirmRemoveContainerModal'
import { Modal } from '@/components/ui/Modal'
import type { DockerContainer } from '@/types/api'

const POLL_INTERVAL_MS = 5000

const STATUS_LABEL: Record<string, string> = {
  unknown: 'Checking…',
  'not-installed': 'Docker not installed',
  stopped: 'Docker not running',
  running: 'Docker running',
}

const STATUS_DOT: Record<string, string> = {
  unknown: 'bg-fg-subtle',
  'not-installed': 'bg-fg-subtle',
  stopped: 'bg-red-400',
  running: 'bg-green-400',
}

interface ContainerGroup {
  key: string
  project?: string
  containers: DockerContainer[]
}

// Compose stamps every container in a stack with the same
// `com.docker.compose.project` label — group on that, in order of first
// appearance, so a project's containers render together instead of
// interleaved with another project's. Containers with no project label
// (plain `docker run`) become single-container groups, which render as
// the same flat, header-less row the panel always showed.
function groupContainers(containers: DockerContainer[]): ContainerGroup[] {
  const groups: ContainerGroup[] = []
  const byProject = new Map<string, ContainerGroup>()
  for (const container of containers) {
    if (!container.project) {
      groups.push({ key: container.id, containers: [container] })
      continue
    }
    let group = byProject.get(container.project)
    if (!group) {
      group = { key: container.project, project: container.project, containers: [] }
      byProject.set(container.project, group)
      groups.push(group)
    }
    group.containers.push(container)
  }
  return groups
}

function RefreshIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 3v4h-4M6 21v-4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4l14 8-14 8V4Z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="1.5" />
    </svg>
  )
}

function RestartIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 3v4h-4M6 21v-4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`}
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GroupStatusDot({ containers }: { containers: DockerContainer[] }) {
  const running = containers.filter((c) => c.state === 'running').length
  if (running === 0) return <span className="w-2 h-2 rounded-full shrink-0 bg-fg-subtle" />
  if (running === containers.length) return <span className="w-2 h-2 rounded-full shrink-0 bg-green-400" />
  return (
    <span className="relative w-2 h-2 rounded-full shrink-0 overflow-hidden bg-fg-subtle">
      <span className="absolute inset-y-0 left-0 w-1/2 bg-green-400" />
    </span>
  )
}

function IconButton({ onClick, label, danger, disabled, children }: {
  onClick: () => void
  label: string
  danger?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={[
        'w-5 h-5 flex items-center justify-center rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed',
        danger ? 'text-red-400 hover:bg-red-500/10' : 'text-fg-muted hover:text-fg hover:bg-white/5',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function ContainerRow({ container, onRequestRemove }: {
  container: DockerContainer
  onRequestRemove: (container: DockerContainer) => void
}) {
  const startContainer = useDockerStore((s) => s.startContainer)
  const stopContainer = useDockerStore((s) => s.stopContainer)
  const restartContainer = useDockerStore((s) => s.restartContainer)
  const running = container.state === 'running'

  function openLogs() {
    useEditorStore.getState().openTab({
      path: buildDockerLogsPath(container.id, container.name),
      content: '',
      dirty: false,
    })
  }

  return (
    <li className="flex flex-col gap-1 px-3 py-2 rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={openLogs} className="flex items-center gap-2 min-w-0 flex-1 text-left">
          <span className={`w-2 h-2 rounded-full shrink-0 ${running ? 'bg-green-400' : 'bg-fg-subtle'}`} />
          <span className="text-xs font-medium text-fg truncate">{container.name}</span>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          {running ? (
            <IconButton onClick={() => stopContainer(container.id)} label="Stop"><StopIcon /></IconButton>
          ) : (
            <IconButton onClick={() => startContainer(container.id)} label="Start"><PlayIcon /></IconButton>
          )}
          <IconButton onClick={() => restartContainer(container.id)} label="Restart"><RestartIcon /></IconButton>
          <IconButton onClick={() => onRequestRemove(container)} label="Remove" danger>✕</IconButton>
        </div>
      </div>
      <span className="text-[0.625rem] text-fg-muted pl-4 truncate">{container.status}</span>
    </li>
  )
}

function GroupHeader({ project, containers, collapsed, onToggleCollapse, onStop, onRequestRemove }: {
  project: string
  containers: DockerContainer[]
  collapsed: boolean
  onToggleCollapse: () => void
  onStop: () => void
  onRequestRemove: () => void
}) {
  const hasRunning = containers.some((c) => c.state === 'running')
  return (
    <div className="flex items-center justify-between gap-2 px-1 py-1">
      <button type="button" onClick={onToggleCollapse} className="flex items-center gap-1.5 min-w-0 flex-1 text-left text-fg-muted hover:text-fg transition-colors">
        <ChevronIcon collapsed={collapsed} />
        <GroupStatusDot containers={containers} />
        <span className="text-xs font-semibold text-fg truncate">{project}</span>
        <span className="text-[0.625rem] text-fg-subtle shrink-0">({containers.length})</span>
      </button>
      <div className="flex items-center gap-0.5 shrink-0">
        <IconButton onClick={onStop} label={`Stop ${project}`} disabled={!hasRunning}><StopIcon /></IconButton>
        <IconButton onClick={onRequestRemove} label={`Remove ${project}`} danger>✕</IconButton>
      </div>
    </div>
  )
}

export function DockerPanel() {
  const status = useDockerStore((s) => s.status)
  const containers = useDockerStore((s) => s.containers)
  const refresh = useDockerStore((s) => s.refresh)
  const startWatching = useDockerStore((s) => s.startWatching)
  const stopWatching = useDockerStore((s) => s.stopWatching)
  const openApp = useDockerStore((s) => s.openApp)
  const stopContainers = useDockerStore((s) => s.stopContainers)
  const removeContainers = useDockerStore((s) => s.removeContainers)
  const [removeTarget, setRemoveTarget] = useState<DockerContainer | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [removeAllConfirmOpen, setRemoveAllConfirmOpen] = useState(false)
  const [removeGroupTarget, setRemoveGroupTarget] = useState<ContainerGroup | null>(null)

  useEffect(() => {
    refresh()
    startWatching()
    const offChanged = window.api.onDockerChanged(() => refresh())
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      refresh()
    }, POLL_INTERVAL_MS)
    return () => {
      offChanged()
      clearInterval(interval)
      stopWatching()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const groups = useMemo(() => groupContainers(containers), [containers])
  const hasRunningContainers = containers.some((c) => c.state === 'running')

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
      <div className="h-9 px-3 border-b border-border shrink-0 flex items-center justify-between">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Docker</span>
        <div className="flex items-center gap-1">
          {status === 'running' && containers.length > 0 && (
            <>
              <IconButton
                onClick={() => stopContainers(containers.map((c) => c.id))}
                label="Stop All"
                disabled={!hasRunningContainers}
              >
                <StopIcon />
              </IconButton>
              <IconButton onClick={() => setRemoveAllConfirmOpen(true)} label="Remove All Containers" danger>✕</IconButton>
            </>
          )}
          <button
            type="button"
            onClick={() => refresh()}
            aria-label="Refresh"
            title="Refresh"
            className="text-fg-muted hover:text-fg transition-colors"
          >
            <RefreshIcon />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
            <span className="text-xs font-medium text-fg">{STATUS_LABEL[status] ?? status}</span>
          </div>
          {status === 'stopped' && (
            <button type="button" onClick={() => openApp()} className="text-xs text-accent hover:opacity-80 transition-opacity">
              Start Docker
            </button>
          )}
        </div>

        {status === 'not-installed' && (
          <p className="text-xs text-fg-muted text-center leading-relaxed pt-2">
            Install Docker to see and control containers here.
          </p>
        )}
        {status === 'running' && containers.length === 0 && (
          <p className="text-xs text-fg-muted text-center leading-relaxed pt-2">No containers found.</p>
        )}
        {status === 'running' && containers.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {groups.map((group) =>
              group.project ? (
                <li key={group.key} className="flex flex-col gap-1.5">
                  <GroupHeader
                    project={group.project}
                    containers={group.containers}
                    collapsed={collapsedGroups.has(group.key)}
                    onToggleCollapse={() => toggleGroup(group.key)}
                    onStop={() => stopContainers(group.containers.map((c) => c.id))}
                    onRequestRemove={() => setRemoveGroupTarget(group)}
                  />
                  {!collapsedGroups.has(group.key) && (
                    <ul className="flex flex-col gap-1.5 pl-3">
                      {group.containers.map((container) => (
                        <ContainerRow key={container.id} container={container} onRequestRemove={setRemoveTarget} />
                      ))}
                    </ul>
                  )}
                </li>
              ) : (
                group.containers.map((container) => (
                  <ContainerRow key={container.id} container={container} onRequestRemove={setRemoveTarget} />
                ))
              )
            )}
          </ul>
        )}
      </div>

      {removeTarget && (
        <ConfirmRemoveContainerModal container={removeTarget} onClose={() => setRemoveTarget(null)} />
      )}

      {removeAllConfirmOpen && (
        <Modal onClose={() => setRemoveAllConfirmOpen(false)}>
          <h2 className="text-sm font-semibold text-fg mb-1">Remove All Containers</h2>
          <p className="text-sm text-fg-muted mb-5">
            Remove all {containers.length} container{containers.length === 1 ? '' : 's'}? Running containers
            will be stopped first. This cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setRemoveAllConfirmOpen(false)}
              className="px-4 py-1.5 text-sm rounded-lg border border-border text-fg-muted hover:text-fg hover:border-fg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                removeContainers(containers.map((c) => c.id))
                setRemoveAllConfirmOpen(false)
              }}
              className="px-4 py-1.5 text-sm rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold transition-colors"
            >
              Remove All
            </button>
          </div>
        </Modal>
      )}

      {removeGroupTarget && (
        <Modal onClose={() => setRemoveGroupTarget(null)}>
          <h2 className="text-sm font-semibold text-fg mb-1">Remove {removeGroupTarget.project}</h2>
          <p className="text-sm text-fg-muted mb-5">
            Remove all {removeGroupTarget.containers.length} container
            {removeGroupTarget.containers.length === 1 ? '' : 's'} in{' '}
            <span className="font-mono text-fg">{removeGroupTarget.project}</span>? Running containers will
            be stopped first. This cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setRemoveGroupTarget(null)}
              className="px-4 py-1.5 text-sm rounded-lg border border-border text-fg-muted hover:text-fg hover:border-fg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                removeContainers(removeGroupTarget.containers.map((c) => c.id))
                setRemoveGroupTarget(null)
              }}
              className="px-4 py-1.5 text-sm rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold transition-colors"
            >
              Remove
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
