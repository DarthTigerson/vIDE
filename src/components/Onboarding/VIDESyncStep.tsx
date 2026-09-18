import { useEffect } from 'react'
import { useConfigRepoStore } from '@/stores/configRepoStore'
import { Toggle } from '@/components/ui/Toggle'
import { TextField } from '@/components/Settings/SettingsLayout'
import { SyncStatusPill } from '@/components/Settings/SyncStatusPill'
import { SyncConflictModal } from '@/components/Settings/SyncConflictModal'

export function VIDESyncStep() {
  const {
    loaded, load,
    enabled, setEnabled,
    repoUrl, setRepoUrl,
    token, setToken,
    status, lastSyncAt, errorMessage,
    pendingConflicts,
    connect, resolveConflicts, dismissConflicts,
  } = useConfigRepoStore()

  useEffect(() => { if (!loaded) load() }, [loaded, load])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-fg">vIDE Sync</h2>
        <p className="text-xs text-fg-muted mt-0.5">
          Back up and restore your IDE settings and data via a private git repository you own.
          You can set this up later in Settings → General.
        </p>
      </div>

      <div className="flex items-start justify-between gap-3">
        <Toggle
          label="Enable vIDE Sync"
          description="Store your settings, themes, and data in a repo you control."
          checked={enabled}
          onChange={setEnabled}
        />
        <SyncStatusPill status={status} lastSyncAt={lastSyncAt} />
      </div>

      {enabled && (
        <div className="flex flex-col gap-3 pl-4 border-l border-border/40">
          <TextField
            id="wizard-config-repo-url"
            label="Repository URL"
            value={repoUrl}
            onChange={setRepoUrl}
            placeholder="https://github.com/you/vide-config.git"
          />
          <div className="flex flex-col gap-1.5">
            <TextField
              id="wizard-config-repo-token"
              label="Personal Access Token"
              type="password"
              value={token}
              onChange={setToken}
              placeholder="ghp_••••••••••••••••"
            />
            <p className="text-xs text-fg-muted">
              Fine-grained token: grant <span className="text-fg font-medium">Contents → Read and write</span> on the target repository.
            </p>
          </div>

          {errorMessage && (
            <p className="text-xs text-red-400">{errorMessage}</p>
          )}

          {repoUrl.trim() && token.trim() && (
            <button
              type="button"
              disabled={status === 'connecting'}
              onClick={connect}
              className="self-start h-8 px-3 rounded border border-border text-sm text-fg hover:border-fg-subtle transition-colors disabled:opacity-40"
            >
              {status === 'connecting' ? 'Connecting…' : status === 'connected' ? 'Connected ✓' : 'Connect'}
            </button>
          )}
        </div>
      )}

      {pendingConflicts && (
        <SyncConflictModal
          result={pendingConflicts}
          onResolve={resolveConflicts}
          onCancel={dismissConflicts}
        />
      )}
    </div>
  )
}
