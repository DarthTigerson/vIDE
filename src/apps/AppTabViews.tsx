import type { Json } from './videApiTypes'
import { parseAppTabPath } from '@/components/Settings/paths'
import { useAppContribStore } from './appContribStore'
import { AppErrorBoundary } from './AppErrorBoundary'

function NotLoaded() {
  return <div className="p-4 text-sm text-fg-muted">This app isn't loaded.</div>
}

// An app-tab://<appId>/<kind>?p=… tab: the app's registered tab kind.
export function AppTabView({ path }: { path: string }) {
  const parsed = parseAppTabPath(path)
  const kind = useAppContribStore((s) => (parsed ? s.tabKinds[`${parsed.appId}/${parsed.kind}`] : undefined))
  if (!parsed || !kind) return <NotLoaded />
  const Body = kind.component
  let title = parsed.kind
  try { title = kind.title(parsed.params as Json) } catch { /* keep the kind as the title */ }
  return (
    <div className="h-full overflow-auto">
      <AppErrorBoundary appId={parsed.appId} title={title}>
        <Body params={parsed.params as Json} />
      </AppErrorBoundary>
    </div>
  )
}

// settings://app/<appId>: the app's registered settings page.
export function AppSettingsView({ appId }: { appId: string }) {
  const page = useAppContribStore((s) => s.settingsPages[appId])
  if (!page) return <NotLoaded />
  const Body = page.component
  return (
    <div className="h-full overflow-auto">
      <AppErrorBoundary appId={appId} title={page.title}><Body /></AppErrorBoundary>
    </div>
  )
}
