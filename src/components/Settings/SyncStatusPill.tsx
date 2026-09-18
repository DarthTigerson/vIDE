import type { SyncStatus } from '@/stores/configRepoStore'

function formatRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function SyncStatusPill({
  status,
  lastSyncAt,
}: {
  status: SyncStatus
  lastSyncAt: number | null
}) {
  if (status === 'idle') return null

  const dot: Record<SyncStatus, string> = {
    idle: '',
    connecting: 'bg-yellow-400 animate-pulse',
    connected: 'bg-green-400',
    syncing: 'bg-yellow-400 animate-pulse',
    error: 'bg-red-400',
  }

  const label: Record<SyncStatus, string> = {
    idle: '',
    connecting: 'Connecting…',
    connected: lastSyncAt ? `Synced ${formatRelativeTime(lastSyncAt)}` : 'Connected',
    syncing: 'Syncing…',
    error: 'Sync error',
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
      <span className={`w-1.5 h-1.5 rounded-full ${dot[status]}`} />
      <span className="text-xs text-fg-muted whitespace-nowrap">{label[status]}</span>
    </div>
  )
}
