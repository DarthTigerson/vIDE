import { useCallback, useEffect, useState } from 'react'
import type { VcloakRepoRow } from '../../../electron/vcloak/types'
import { useVcloakStore } from '@/stores/vcloakStore'
import { useEditorStore } from '@/stores/editorStore'
import { useFileStore } from '@/stores/fileStore'
import { VCLOAK_SETTINGS_TAB_PATH } from '@/components/Settings/paths'

const MAX_ROWS = 50

export function VcloakPanel() {
  const state = useVcloakStore((s) => s.state)
  const setState = useVcloakStore((s) => s.setState)
  const projectRoot = useFileStore((s) => s.projectRoot)
  const [repos, setRepos] = useState<VcloakRepoRow[]>([])
  const [busy, setBusy] = useState(false)

  const loadRepos = useCallback(async () => {
    try { setRepos((await window.api.vcloakListRepos()) ?? []) } catch { setRepos([]) }
  }, [])

  useEffect(() => { void loadRepos() }, [loadRepos, state])

  const rescan = async () => {
    setBusy(true)
    try { setState(await window.api.vcloakRescan(projectRoot ?? undefined)) } finally { setBusy(false) }
  }

  const openSettings = () =>
    useEditorStore.getState().openTab({ path: VCLOAK_SETTINGS_TAB_PATH, content: '', dirty: false })

  const gateway = !state ? 'unknown'
    : state.gateway.error ? 'error'
    : state.gateway.running ? 'running' : 'stopped'
  const shown = repos.slice(0, MAX_ROWS)

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
      <div className="h-9 px-3 border-b border-border shrink-0 flex items-center">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">vCloak</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 text-xs space-y-3">
        <div className="space-y-1">
          <div>{state?.config.enabled ? 'vCloak is On' : 'vCloak is Off'}</div>
          <div className="text-fg-muted">Gateway: {gateway}</div>
          {state?.gateway.error && <div className="text-red-400">{state.gateway.error}</div>}
        </div>
        <div className="space-y-1 text-fg-muted">
          <div>Requests: {state?.stats.requests ?? 0}</div>
          <div>Masked: {state?.stats.masked ?? 0}</div>
          <div>Blocked: {state?.stats.blocked ?? 0}</div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={openSettings} className="px-2 py-1 rounded border border-border hover:bg-white/10">Settings</button>
          <button type="button" onClick={() => void rescan()} disabled={busy} className="px-2 py-1 rounded border border-border hover:bg-white/10 disabled:opacity-50">Rescan</button>
        </div>
        <div>
          <div className="font-semibold text-fg-muted uppercase tracking-wider mb-1">Cloaked Repos</div>
          {repos.length === 0 && <div className="text-fg-muted">No repos found yet.</div>}
          {shown.map((r) => (
            <div key={r.remote} className="flex justify-between gap-2 py-0.5">
              <span className="truncate" title={r.remote}>{r.remote.split('/').pop()}</span>
              <span className="truncate text-fg-muted" title={r.alias ?? 'visible'}>{r.alias ?? 'visible'}</span>
            </div>
          ))}
          {repos.length > MAX_ROWS && <div className="text-fg-muted">+{repos.length - MAX_ROWS} more</div>}
        </div>
      </div>
    </div>
  )
}
