import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDockerStore } from '@/stores/dockerStore'
import { useEditorStore } from '@/stores/editorStore'
import { useDockerLiveUpdates } from '@/hooks/useDockerLiveUpdates'
import { useDockerSettingsStore, type DockerMemoryFormat } from '@/stores/dockerSettingsStore'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { buildDockerLogsPath } from './paths'
import { ConfirmRemoveContainerModal } from './ConfirmRemoveContainerModal'
import { Modal } from '@/components/ui/Modal'
import { DockerIcon } from '@/components/ActivityBar/ActivityBar'
import type { DockerContainer, DockerContainerStats } from '@/types/api'

const MEMORY_POLL_INTERVAL_MS = 5000

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  // Round to one decimal below 10 (e.g. "4.6 MB") but drop the trailing
  // ".0" on a clean whole number ("1 GB", not "1.0 GB") — Number's default
  // string conversion does that for free.
  const rounded = value < 10 && unitIndex > 0 ? Math.round(value * 10) / 10 : Math.round(value)
  return `${rounded} ${units[unitIndex]}`
}

function formatMemory(stats: DockerContainerStats, format: DockerMemoryFormat): string {
  switch (format) {
    case 'usedPercent':
      return `${Math.round(stats.percent)}%`
    case 'availablePercent':
      return `${Math.round(100 - stats.percent)}%`
    case 'usedAbsolute':
      return formatBytes(stats.usedBytes)
    case 'usedOverLimit':
      return `${formatBytes(stats.usedBytes)} / ${formatBytes(stats.limitBytes)}`
  }
}

// Sums usage across a group's running containers. Limits deliberately take
// the max rather than the sum: an unconstrained container reports its
// limit as the host's total RAM, so several unconstrained containers in
// the same project would otherwise multiply that ceiling by container
// count instead of sharing it, wildly understating the group's real %.
function aggregateGroupStats(
  containers: DockerContainer[],
  statsById: Record<string, DockerContainerStats>
): DockerContainerStats | null {
  const withStats = containers.filter((c) => c.state === 'running' && statsById[c.id])
  if (withStats.length === 0) return null
  let usedBytes = 0
  let limitBytes = 0
  for (const c of withStats) {
    const s = statsById[c.id]
    usedBytes += s.usedBytes
    limitBytes = Math.max(limitBytes, s.limitBytes)
  }
  return { usedBytes, limitBytes, percent: limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0 }
}

// Short form — sits next to the "Docker" panel title, so it doesn't repeat
// the word itself the way the old inline status row's copy did.
const STATUS_LABEL: Record<string, string> = {
  unknown: 'Checking…',
  'not-installed': 'Not installed',
  stopped: 'Not running',
  running: 'Running',
}

const STATUS_DOT: Record<string, string> = {
  unknown: 'bg-fg-subtle',
  'not-installed': 'bg-fg-subtle',
  stopped: 'bg-red-400',
  running: 'bg-green-400',
}

// Same chip treatment as MobileDisplayPanel's "N connected" header badge —
// a subtle rounded pill so the state reads as a distinct status indicator
// rather than a continuation of the plain title text.
const STATUS_CHIP: Record<string, string> = {
  unknown: 'text-fg-muted bg-white/5',
  'not-installed': 'text-fg-muted bg-white/5',
  stopped: 'text-red-400 bg-red-400/10',
  running: 'text-green-400 bg-green-400/10',
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

// Logs/document glyph for the context menu's "Open" item — the row's own
// left-click already opens the logs tab; this just surfaces the same
// action as a right-click menu entry too.
function LogsIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 9h8M8 13h8M8 17h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

function DotsIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
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

interface MenuAction {
  key: string
  label: string
  icon: React.ReactNode
  onSelect: () => void
  disabled?: boolean
  danger?: boolean
}

// Right-click menu for a container row or group header — portaled at the
// click position and clamped to the viewport after the real render
// (matching CommitFileContextMenu's positioning pattern).
//
// Closes on 'pointerdown' rather than 'click' — specifically so that
// right-clicking a *different* row/group closes this
// one: a right-click never fires a 'click' event, so a click-based listener
// would leave every previously-opened menu stacked up on screen instead of
// replacing it (contextmenu fires after pointerdown, so the outside-click
// check below still sees this menu as "not yet reopened" and closes it,
// then the newly-clicked row's own contextmenu handler opens its menu).
function ContextMenuList({ x, y, actions, onClose }: {
  x: number
  y: number
  actions: MenuAction[]
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  useLayoutEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const clamped = clampToViewport(x, y, rect.width, rect.height)
    menuRef.current.style.left = `${clamped.x}px`
    menuRef.current.style.top = `${clamped.y}px`
  }, [x, y])

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[200] min-w-[130px] rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50 flex flex-col gap-0.5"
      style={{ left: x, top: y }}
    >
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          disabled={action.disabled}
          onClick={() => {
            onClose()
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
    </div>,
    document.body
  )
}

type ContainerAction = 'start' | 'stop' | 'restart' | null

function ContainerRow({ container, onRequestRemove, nested }: {
  container: DockerContainer
  onRequestRemove: (container: DockerContainer) => void
  // Inside a group, the group's own outer box (header + all its containers
  // together) already provides the surrounding border — an individual row
  // here gets a fainter nested card instead of the full-strength one a
  // standalone row uses.
  nested?: boolean
}) {
  const startContainer = useDockerStore((s) => s.startContainer)
  const stopContainer = useDockerStore((s) => s.stopContainer)
  const restartContainer = useDockerStore((s) => s.restartContainer)
  const stats = useDockerStore((s) => s.containerStats[container.id])
  const showMemory = useDockerSettingsStore((s) => s.showMemory)
  const memoryFormat = useDockerSettingsStore((s) => s.memoryFormat)
  const [pendingAction, setPendingAction] = useState<ContainerAction>(null)
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null)
  const running = container.state === 'running'
  const busy = pendingAction !== null

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

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    setContextMenuPos({ x: e.clientX, y: e.clientY })
  }

  const actions: MenuAction[] = [
    { key: 'open', label: 'Open', icon: <LogsIcon />, onSelect: openLogs },
    running
      ? { key: 'stop', label: 'Stop', icon: <StopIcon />, disabled: busy, onSelect: () => run('stop', () => stopContainer(container.id)) }
      : { key: 'start', label: 'Start', icon: <PlayIcon />, disabled: busy, onSelect: () => run('start', () => startContainer(container.id)) },
    { key: 'restart', label: 'Restart', icon: <RestartIcon />, disabled: busy, onSelect: () => run('restart', () => restartContainer(container.id)) },
    { key: 'remove', label: 'Remove', icon: <CloseIcon />, danger: true, disabled: busy, onSelect: () => onRequestRemove(container) },
  ]

  return (
    <li
      onContextMenu={handleContextMenu}
      className={[
        'flex flex-col gap-1 px-3 py-2 rounded-lg border',
        nested ? 'border-border/60 bg-white/[0.02]' : 'border-border',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={openLogs} className="flex items-center gap-2 min-w-0 flex-1 text-left">
          {busy ? (
            <RefreshIcon className="w-2 h-2 shrink-0 animate-spin text-fg-muted" />
          ) : (
            <span className={`w-2 h-2 rounded-full shrink-0 ${running ? 'bg-green-400' : 'bg-fg-subtle'}`} />
          )}
          <span className="text-xs font-medium text-fg truncate">{container.name}</span>
        </button>
        {showMemory && running && stats && (
          <span className="text-[0.625rem] text-fg-subtle shrink-0 tabular-nums">
            {formatMemory(stats, memoryFormat)}
          </span>
        )}
      </div>
      <span className="text-[0.625rem] text-fg-muted pl-4 truncate">{container.status}</span>

      {contextMenuPos && (
        <ContextMenuList
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          actions={actions}
          onClose={() => setContextMenuPos(null)}
        />
      )}
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
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null)
  const busy = pendingAction !== null
  const containerStats = useDockerStore((s) => s.containerStats)
  const showMemory = useDockerSettingsStore((s) => s.showMemory)
  const memoryFormat = useDockerSettingsStore((s) => s.memoryFormat)
  const groupStats = showMemory ? aggregateGroupStats(containers, containerStats) : null

  async function run(action: Exclude<GroupAction, null>, fn: () => Promise<unknown>) {
    setPendingAction(action)
    try {
      await fn()
    } finally {
      setPendingAction(null)
    }
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    setContextMenuPos({ x: e.clientX, y: e.clientY })
  }

  // No "Open" entry here — unlike a container row, a project has no single
  // logs tab to jump to.
  const actions: MenuAction[] = [
    { key: 'start', label: 'Start All', icon: <PlayIcon />, disabled: !hasStopped || busy, onSelect: () => run('start', onStart) },
    { key: 'stop', label: 'Stop All', icon: <StopIcon />, disabled: !hasRunning || busy, onSelect: () => run('stop', onStop) },
    { key: 'remove', label: 'Remove All', icon: <CloseIcon />, danger: true, disabled: busy, onSelect: onRequestRemove },
  ]

  return (
    <div onContextMenu={handleContextMenu} className="flex items-center justify-between gap-2 px-3 py-2">
      <button type="button" onClick={onToggleCollapse} className="flex items-center gap-1.5 min-w-0 flex-1 text-left text-fg-muted hover:text-fg transition-colors">
        <ChevronIcon collapsed={collapsed} />
        {busy ? (
          <RefreshIcon className="w-2 h-2 shrink-0 animate-spin text-fg-muted" />
        ) : (
          <GroupStatusDot containers={containers} />
        )}
        <span className="text-xs font-semibold text-fg truncate">{project}</span>
        <span className="text-[0.625rem] text-fg-subtle shrink-0">({containers.length})</span>
      </button>
      {groupStats && (
        <span className="text-[0.625rem] text-fg-subtle shrink-0 tabular-nums">
          {formatMemory(groupStats, memoryFormat)}
        </span>
      )}

      {contextMenuPos && (
        <ContextMenuList
          x={contextMenuPos.x}
          y={contextMenuPos.y}
          actions={actions}
          onClose={() => setContextMenuPos(null)}
        />
      )}
    </div>
  )
}

export function DockerPanel() {
  const status = useDockerStore((s) => s.status)
  const containers = useDockerStore((s) => s.containers)
  const refresh = useDockerStore((s) => s.refresh)
  const refreshStats = useDockerStore((s) => s.refreshStats)
  const showMemory = useDockerSettingsStore((s) => s.showMemory)
  const openApp = useDockerStore((s) => s.openApp)
  const closeApp = useDockerStore((s) => s.closeApp)
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
  const [headerMenuPos, setHeaderMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [closeDockerConfirmOpen, setCloseDockerConfirmOpen] = useState(false)
  const [closingDocker, setClosingDocker] = useState(false)

  useDockerLiveUpdates(true)

  useEffect(() => {
    if (!showMemory || status !== 'running') return
    refreshStats()
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      refreshStats()
    }, MEMORY_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMemory, status])

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

  async function handleCloseDocker() {
    setClosingDocker(true)
    try {
      await closeApp()
    } finally {
      setClosingDocker(false)
    }
    setCloseDockerConfirmOpen(false)
  }

  function openHeaderMenu(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    setHeaderMenuPos({ x: rect.right - 140, y: rect.bottom + 4 })
  }

  const headerActions: MenuAction[] = [
    { key: 'refresh', label: 'Refresh', icon: <RefreshIcon />, onSelect: () => refresh() },
    {
      key: 'close',
      label: 'Close Docker',
      icon: <CloseIcon />,
      danger: true,
      disabled: status !== 'running' || closingDocker,
      onSelect: () => setCloseDockerConfirmOpen(true),
    },
  ]

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
      <div className="h-9 px-3 border-b border-border shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
          <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider shrink-0">Docker</span>
          <span className={`text-[0.625rem] font-medium px-1.5 py-0.5 rounded-full shrink-0 truncate ${STATUS_CHIP[status] ?? 'text-fg-muted bg-white/5'}`}>
            {STATUS_LABEL[status] ?? status}
          </span>
        </div>
        <button
          type="button"
          onClick={openHeaderMenu}
          aria-label="Docker panel actions"
          aria-haspopup="true"
          className="w-5 h-5 flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-white/5 transition-colors shrink-0"
        >
          <DotsIcon />
        </button>
      </div>

      {headerMenuPos && (
        <ContextMenuList
          x={headerMenuPos.x}
          y={headerMenuPos.y}
          actions={headerActions}
          onClose={() => setHeaderMenuPos(null)}
        />
      )}

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
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
                <li key={group.key} className="rounded-lg border border-border overflow-hidden">
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
                    <ul className="flex flex-col gap-1.5 pl-6 pr-2 pb-2">
                      {group.containers.map((container) => (
                        <ContainerRow key={container.id} container={container} onRequestRemove={setRemoveTarget} nested />
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

      {closeDockerConfirmOpen && (
        <Modal onClose={() => setCloseDockerConfirmOpen(false)}>
          <h2 className="text-sm font-semibold text-fg mb-1">Close Docker</h2>
          <p className="text-sm text-fg-muted mb-5">
            Quit Docker? This stops every running container along with it.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setCloseDockerConfirmOpen(false)}
              className="px-4 py-1.5 text-sm rounded-lg border border-border text-fg-muted hover:text-fg hover:border-fg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCloseDocker}
              disabled={closingDocker}
              aria-busy={closingDocker}
              className="px-4 py-1.5 text-sm rounded-lg bg-red-600/80 hover:bg-red-600 text-white font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {closingDocker && <RefreshIcon className="animate-spin" />}
              Close Docker
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
