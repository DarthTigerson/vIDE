import { useAppContribStore } from './appContribStore'
import { AppErrorBoundary } from './AppErrorBoundary'

// The sidebar body for a store app's panel, isolated so a crash shows a
// message instead of taking the sidebar down.
export function StoreAppPanel({ appId }: { appId: string }) {
  const panel = useAppContribStore((s) => s.panels[appId])
  if (!panel) {
    return <div className="h-full bg-sidebar border-r border-border p-3 text-xs text-fg-muted">This app isn't loaded.</div>
  }
  const Body = panel.component
  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
      <div className="h-9 px-3 border-b border-border shrink-0 flex items-center">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider truncate">{panel.title}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <AppErrorBoundary appId={appId} title={panel.title}><Body /></AppErrorBoundary>
      </div>
    </div>
  )
}
