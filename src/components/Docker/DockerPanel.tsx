import { useEffect, useMemo, useRef, useState } from 'react'
import { useDockerStore } from '@/stores/dockerStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildDockerLogsPath } from './paths'
import { ConfirmRemoveContainerModal } from './ConfirmRemoveContainerModal'
import { Modal } from '@/components/ui/Modal'
import { DockerIcon } from '@/components/ActivityBar/ActivityBar'
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

const pillButtonClass =
  'w-full h-7 rounded-full flex items-center justify-center text-[0.625rem] font-bold tracking-tight transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed bg-accent/80 text-on-accent hover:bg-accent'

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

export function RefreshIcon({ className }: { className?: string } = {}) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className={className}>
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

// SVG rather than a literal "✕" character — text content inside a button
// becomes part of its accessible name, which would turn "Remove" into "✕
// Remove" for screen readers and role-based test queries alike.
function CloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
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

function DotsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  )
}

interface MenuAction {
  key: string
  label: string
  icon: React.ReactNode
  onSelect: () => void
  disabled?: boolean
  danger?: boolean
}

// Kebab trigger + dropdown, replacing what used to be a row of inline icon
// buttons — same click-outside-closes pattern as GitPanel's SplitCommandButton
// options popover. `busy` swaps the trigger itself for a spinner and closes
// off further clicks while a selected action is in flight.
function ActionMenu({ actions, busy, triggerLabel }: {
  actions: MenuAction[]
  busy: boolean
  triggerLabel: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="true"
        aria-expanded={open}
        aria-busy={busy}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="w-5 h-5 flex items-center justify-center rounded transition-colors text-fg-muted hover:text-fg hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {busy ? <RefreshIcon className="animate-spin" /> : <DotsIcon />}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-30 min-w-[130px] rounded-md border border-border bg-popover shadow-2xl shadow-black/40 p-1 flex flex-col gap-0.5">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              disabled={action.disabled}
              onClick={() => {
                setOpen(false)
                action.onSelect()
              }}
              className={[
                'flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                action.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-fg hover:bg-white/5',
              ].join(' ')}
            >
              <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

type ContainerAction = 'start' | 'stop' | 'restart' | null

function ContainerRow({ container, onRequestRemove }: {
  container: DockerContainer
  onRequestRemove: (container: DockerContainer) => void
}) {
  const startContainer = useDockerStore((s) => s.startContainer)
  const stopContainer = useDockerStore((s) => s.stopContainer)
  const restartContainer = useDockerStore((s) => s.restartContainer)
  const [pendingAction, setPendingAction] = useState<ContainerAction>(null)
  const running = container.state === 'running'

  function openLogs() {
    useEditorStore.getState().openTab({
      path: buildDockerLogsPath(container.id, container.name),
      content: '',
      dirty: false,
    })
  }

  async function run(action: Exclude<ContainerAction, null>, fn: () => Promise<unknown>) {
    setPendingAction(action)
    try {
      await fn()
    } finally {
      setPendingAction(null)
    }
  }

  const actions: MenuAction[] = [
    running
      ? { key: 'stop', label: 'Stop', icon: <StopIcon />, onSelect: () => run('stop', () => stopContainer(container.id)) }
      : { key: 'start', label: 'Start', icon: <PlayIcon />, onSelect: () => run('start', () => startContainer(container.id)) },
    { key: 'restart', label: 'Restart', icon: <RestartIcon />, onSelect: () => run('restart', () => restartContainer(container.id)) },
    { key: 'remove', label: 'Remove', icon: <CloseIcon />, danger: true, onSelect: () => onRequestRemove(container) },
  ]

  return (
    <li className="flex flex-col gap-1 px-3 py-2 rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={openLogs} className="flex items-center gap-2 min-w-0 flex-1 text-left">
          <span className={`w-2 h-2 rounded-full shrink-0 ${running ? 'bg-green-400' : 'bg-fg-subtle'}`} />
          <span className="text-xs font-medium text-fg truncate">{container.name}</span>
        </button>
        <ActionMenu actions={actions} busy={pendingAction !== null} triggerLabel={`${container.name} actions`} />
      </div>
      <span className="text-[0.625rem] text-fg-muted pl-4 truncate">{container.status}</span>
    </li>
  )
}

type GroupAction = 'start' | 'stop' | null

function GroupHeader({ project, containers, collapsed, onToggleCollapse, onStart, onStop, onRequestRemove }: {
  project: string
  containers: DockerContainer[]
  collapsed: boolean
  onToggleCollapse: () => void
  onStart: () => Promise<unknown>
  onStop: () => Promise<unknown>
  onRequestRemove: () => void
}) {
  const hasRunning = containers.some((c) => c.state === 'running')
  const hasStopped = containers.some((c) => c.state !== 'running')
  const [pendingAction, setPendingAction] = useState<GroupAction>(null)

  async function run(action: Exclude<GroupAction, null>, fn: () => Promise<unknown>) {
    setPendingAction(action)
    try {
      await fn()
    } finally {
      setPendingAction(null)
    }
  }

  const actions: MenuAction[] = [
    { key: 'start', label: 'Start', icon: <PlayIcon />, disabled: !hasStopped, onSelect: () => run('start', onStart) },
    { key: 'stop', label: 'Stop', icon: <StopIcon />, disabled: !hasRunning, onSelect: () => run('stop', onStop) },
    { key: 'remove', label: 'Remove', icon: <CloseIcon />, danger: true, onSelect: onRequestRemove },
  ]

  return (
    <div className="flex items-center justify-between gap-2 px-1 py-1">
      <button type="button" onClick={onToggleCollapse} className="flex items-center gap-1.5 min-w-0 flex-1 text-left text-fg-muted hover:text-fg transition-colors">
        <ChevronIcon collapsed={collapsed} />
        <GroupStatusDot containers={containers} />
        <span className="text-xs font-semibold text-fg truncate">{project}</span>
        <span className="text-[0.625rem] text-fg-subtle shrink-0">({containers.length})</span>
      </button>
      <ActionMenu actions={actions} busy={pendingAction !== null} triggerLabel={`${project} actions`} />
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
  const startContainers = useDockerStore((s) => s.startContainers)
  const stopContainers = useDockerStore((s) => s.stopContainers)
  const removeContainers = useDockerStore((s) => s.removeContainers)
  const [removeTarget, setRemoveTarget] = useState<DockerContainer | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [stopAllConfirmOpen, setStopAllConfirmOpen] = useState(false)
  const [cleanSlateConfirmOpen, setCleanSlateConfirmOpen] = useState(false)
  const [stopAllRunning, setStopAllRunning] = useState(false)
  const [cleanSlateRunning, setCleanSlateRunning] = useState(false)
  const [removeGroupTarget, setRemoveGroupTarget] = useState<ContainerGroup | null>(null)
  const [removingGroup, setRemovingGroup] = useState(false)
  const [launchingDocker, setLaunchingDocker] = useState(false)

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

  async function handleStopAll() {
    setStopAllConfirmOpen(false)
    setStopAllRunning(true)
    try {
      await stopContainers(containers.map((c) => c.id))
    } finally {
      setStopAllRunning(false)
    }
  }

  async function handleCleanSlate() {
    setCleanSlateConfirmOpen(false)
    setCleanSlateRunning(true)
    try {
      await removeContainers(containers.map((c) => c.id))
    } finally {
      setCleanSlateRunning(false)
    }
  }

  async function handleRemoveGroup() {
    if (!removeGroupTarget) return
    setRemovingGroup(true)
    try {
      await removeContainers(removeGroupTarget.containers.map((c) => c.id))
    } finally {
      setRemovingGroup(false)
    }
    setRemoveGroupTarget(null)
  }

  async function handleLaunchDocker() {
    setLaunchingDocker(true)
    try {
      await openApp()
    } finally {
      setLaunchingDocker(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
      <div className="h-9 px-3 border-b border-border shrink-0 flex items-center justify-between">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Docker</span>
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

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {status !== 'stopped' && (
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
            <span className="text-xs font-medium text-fg">{STATUS_LABEL[status] ?? status}</span>
          </div>
        )}

        {status === 'not-installed' && (
          <p className="text-xs text-fg-muted text-center leading-relaxed pt-2">
            Install Docker to see and control containers here.
          </p>
        )}
        {status === 'stopped' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
            <DockerIcon className="w-10 h-10 text-fg-subtle" />
            <p className="text-xs text-fg-muted text-center leading-relaxed max-w-[200px]">
              Docker isn't running. Launch it to see and manage your containers here.
            </p>
          </div>
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
                    onStart={() => startContainers(group.containers.map((c) => c.id))}
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

      {status === 'stopped' && (
        <div className="border-t border-border shrink-0 px-3 py-2">
          <button
            type="button"
            aria-label="Launch Docker"
            aria-busy={launchingDocker}
            className={pillButtonClass}
            disabled={launchingDocker}
            onClick={handleLaunchDocker}
          >
            {launchingDocker ? <RefreshIcon className="animate-spin" /> : 'Launch Docker'}
          </button>
        </div>
      )}

      {status === 'running' && (
        <div className="border-t border-border shrink-0 px-3 py-2 flex gap-1.5">
          <button
            type="button"
            aria-label="Stop All Containers"
            aria-busy={stopAllRunning}
            className={pillButtonClass}
            disabled={!hasRunningContainers || stopAllRunning}
            onClick={() => setStopAllConfirmOpen(true)}
          >
            {stopAllRunning ? <RefreshIcon className="animate-spin" /> : 'Stop All'}
          </button>
          <button
            type="button"
            aria-label="Clean Slate — stop and remove all containers"
            aria-busy={cleanSlateRunning}
            className={pillButtonClass}
            disabled={containers.length === 0 || cleanSlateRunning}
            onClick={() => setCleanSlateConfirmOpen(true)}
          >
            {cleanSlateRunning ? <RefreshIcon className="animate-spin" /> : 'Clean Slate'}
          </button>
        </div>
      )}

      {removeTarget && (
        <ConfirmRemoveContainerModal container={removeTarget} onClose={() => setRemoveTarget(null)} />
      )}

      {stopAllConfirmOpen && (
        <Modal onClose={() => setStopAllConfirmOpen(false)}>
          <h2 className="text-sm font-semibold text-fg mb-1">Stop All Containers</h2>
          <p className="text-sm text-fg-muted mb-5">
            Stop all {containers.length} container{containers.length === 1 ? '' : 's'}? They can be started
            again afterwards.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setStopAllConfirmOpen(false)}
              className="px-4 py-1.5 text-sm rounded-lg border border-border text-fg-muted hover:text-fg hover:border-fg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStopAll}
              className="px-4 py-1.5 text-sm rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold transition-colors"
            >
              Stop All
            </button>
          </div>
        </Modal>
      )}

      {cleanSlateConfirmOpen && (
        <Modal onClose={() => setCleanSlateConfirmOpen(false)}>
          <h2 className="text-sm font-semibold text-fg mb-1">Clean Slate</h2>
          <p className="text-sm text-fg-muted mb-5">
            Stop and remove all {containers.length} container{containers.length === 1 ? '' : 's'}? This
            cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setCleanSlateConfirmOpen(false)}
              className="px-4 py-1.5 text-sm rounded-lg border border-border text-fg-muted hover:text-fg hover:border-fg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCleanSlate}
              className="px-4 py-1.5 text-sm rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold transition-colors"
            >
              Clean Slate
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
              disabled={removingGroup}
              className="px-4 py-1.5 text-sm rounded-lg border border-border text-fg-muted hover:text-fg hover:border-fg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRemoveGroup}
              disabled={removingGroup}
              aria-busy={removingGroup}
              className="px-4 py-1.5 text-sm rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {removingGroup && <RefreshIcon className="animate-spin" />}
              Remove
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
