import { useState } from 'react'
import type { StoreListing } from '@/types/api'
import { StoreAppAction } from './StoreAppAction'
import { UninstallAppConfirm } from './UninstallAppConfirm'
import { useAppContribStore } from '@/apps/appContribStore'
import { useAppFavoritesStore } from '@/stores/appFavoritesStore'
import { useStoreStore } from '@/stores/storeStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildAppSettingsPath } from '@/components/Settings/paths'
import { APPEND_TARGET } from '@/lib/appFavorites'
import { AllAppsContextMenu } from '@/components/AllApps/AllAppsContextMenu'
import { AppMonogram, DisabledBadge, FromFileBadge, MadeByVsuite } from './storeUi'

// One app in the Store list (canvas board C): clicking the row opens the app's
// page, the action button installs/updates/uninstalls it, and right-clicking an
// installed app opens its menu (favorite, settings, disable/enable, uninstall).
export function StoreAppRow({ app, onOpen }: { app: StoreListing; onOpen: () => void }) {
  // Dev apps are loaded from a folder, not installed from the Store: no menu.
  const installed = useAppContribStore((s) => s.apps.find((a) => a.id === app.id && a.source !== 'dev'))
  const hasPanel = useAppContribStore((s) => !!s.panels[app.id])
  const hasSettings = useAppContribStore((s) => !!s.settingsPages[app.id])
  const favorite = useAppFavoritesStore((s) => s.favorites.includes(`app:${app.id}`))
  const placeFavorite = useAppFavoritesStore((s) => s.place)
  const unfavorite = useAppFavoritesStore((s) => s.unfavorite)
  const setEnabled = useStoreStore((s) => s.setEnabled)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const fromFile = installed?.source === 'file'
  const disabled = installed?.status === 'disabled'
  const busy = useStoreStore((s) => !!s.busy[app.id])
  const id = `app:${app.id}`
  return (
    <article
      className="bg-panel border border-border rounded-[10px] px-4 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0 cursor-pointer hover:border-accent/45 transition-colors"
      onClick={onOpen}
      onContextMenu={installed ? (e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY }) } : undefined}
    >
      <AppMonogram name={app.name} icon={app.icon} />
      <div className="flex-[1_1_260px] min-w-0 flex flex-col gap-0.5">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h2 className="text-sm font-semibold text-fg truncate">{app.name}</h2>
          <MadeByVsuite suffix={app.recommended ? 'Recommended' : undefined} />
          {fromFile && <FromFileBadge />}
          {disabled && <DisabledBadge />}
        </div>
        <p className="text-xs text-fg-muted leading-relaxed">{app.description}</p>
      </div>
      <span className="text-[0.6875rem] text-fg-subtle text-right">
        {app.latest.version}
      </span>
      <StoreAppAction app={app} />
      {menu && installed && (
        <AllAppsContextMenu
          x={menu.x}
          y={menu.y}
          favorite={favorite}
          onToggleFavorite={hasPanel && !disabled ? () => (favorite ? unfavorite(id) : placeFavorite(id, APPEND_TARGET, 'after')) : undefined}
          onSettings={hasSettings && !disabled ? () => useEditorStore.getState().openTab({ path: buildAppSettingsPath(app.id), content: '', dirty: false }) : undefined}
          onDisable={!disabled && !busy && installed.status === 'loaded' ? () => void setEnabled(app.id, false) : undefined}
          onEnable={disabled && !busy ? () => void setEnabled(app.id, true) : undefined}
          onUninstall={busy ? undefined : () => setConfirming(true)}
          onClose={() => setMenu(null)}
        />
      )}
      {confirming && <UninstallAppConfirm appId={app.id} name={app.name} onClose={() => setConfirming(false)} />}
    </article>
  )
}
