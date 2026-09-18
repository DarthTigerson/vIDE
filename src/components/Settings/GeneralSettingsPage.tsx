import { useState, useEffect } from 'react'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { useGeneralSettingsStore } from '@/stores/generalSettingsStore'
import { useConfigRepoStore } from '@/stores/configRepoStore'
import { Toggle } from '@/components/ui/Toggle'
import { Section, Row, TextField } from './SettingsLayout'
import { SyncConflictModal } from './SyncConflictModal'
import { SyncStatusPill } from './SyncStatusPill'

const SYNC_ITEMS = [
  { key: 'general', label: 'General' },
  { key: 'models', label: 'Models' },
  { key: 'git', label: 'Git' },
  { key: 'docker', label: 'Docker' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'notes', label: 'Notes' },
  { key: 'todo', label: 'Todo' },
  { key: 'jira', label: 'Jira' },
]

export function GeneralSettingsPage() {
  const [replaying, setReplaying] = useState(false)

  const openInBiggestPane = useGeneralSettingsStore((s) => s.openInBiggestPane)
  const setOpenInBiggestPane = useGeneralSettingsStore((s) => s.setOpenInBiggestPane)

  const {
    loaded,
    enabled, setEnabled,
    repoUrl, setRepoUrl,
    token, setToken,
    categories, toggleCategory,
    saveRateMinutes, setSaveRateMinutes,
    status, lastSyncAt, errorMessage,
    pendingConflicts,
    connect, sync, resolveConflicts, dismissConflicts,
    load,
  } = useConfigRepoStore()

  useEffect(() => { if (!loaded) load() }, [loaded, load])

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">General</h1>
      <p className="text-sm text-fg-muted mb-4">App-level setup and preferences.</p>

      <Section label="Settings">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Always open in biggest pane"
            description="If the editor is split into multiple panes, open any settings page in whichever pane currently has the most space, instead of the focused one."
            checked={openInBiggestPane}
            onChange={setOpenInBiggestPane}
          />
        </Row>
      </Section>

      <Section label="vIDE Sync">
        <Row>
          <Toggle
            label="Enable vIDE Sync"
            description="Back up and restore your IDE settings and data via a private git repository you own."
            checked={enabled}
            onChange={setEnabled}
          />
          {status !== 'idle' && (
            <div className="mt-1 pl-2">
              <SyncStatusPill status={status} lastSyncAt={lastSyncAt} />
            </div>
          )}
        </Row>

        {enabled && (
          <>
            <Row>
              <ol className="text-sm text-fg-muted mb-3 flex flex-col gap-1 list-decimal list-inside">
                <li>Create a <span className="text-fg font-medium">private</span> repository on GitHub (or any Git host).</li>
                <li>Generate a fine-grained personal access token scoped to <span className="text-fg font-medium">only that repository</span> with <span className="text-fg font-medium">Contents → Read and write</span> permission.</li>
                <li>Paste the repository URL and token below.</li>
              </ol>
              <TextField
                id="config-repo-url"
                label="Repository URL"
                value={repoUrl}
                onChange={setRepoUrl}
                placeholder="https://github.com/you/vide-config.git"
                className="flex flex-col gap-1.5 max-w-md"
              />
              <TextField
                id="config-repo-token"
                label="Personal Access Token"
                type="password"
                value={token}
                onChange={setToken}
                placeholder="ghp_••••••••••••••••"
                className="mt-3 flex flex-col gap-1.5 max-w-md"
              />

              {errorMessage && (
                <p className="mt-2 text-xs text-red-400">{errorMessage}</p>
              )}

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  disabled={!repoUrl.trim() || !token.trim() || status === 'connecting'}
                  onClick={connect}
                  className="h-8 px-3 rounded border border-border text-sm text-fg hover:border-fg-subtle transition-colors disabled:opacity-40"
                >
                  {status === 'connecting' ? 'Connecting…' : 'Connect'}
                </button>
                <button
                  type="button"
                  disabled={status !== 'connected' || status === 'syncing'}
                  onClick={sync}
                  className="h-8 px-3 rounded border border-border text-sm text-fg hover:border-fg-subtle transition-colors disabled:opacity-40"
                >
                  {status === 'syncing' ? 'Syncing…' : 'Sync Now'}
                </button>
              </div>
            </Row>

            <Row>
              <p className="text-sm text-fg mb-2">What to sync</p>
              <div className="flex flex-wrap gap-2">
                {SYNC_ITEMS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleCategory(key)}
                    className={[
                      'h-7 px-3 rounded-full text-sm border transition-colors',
                      categories[key]
                        ? 'bg-accent/20 border-accent/50 text-fg'
                        : 'border-border text-fg-muted hover:border-fg-subtle hover:text-fg',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Row>

            <Row>
              <p className="text-sm text-fg mb-2">Auto-save frequency</p>
              <select
                value={saveRateMinutes}
                onChange={(e) => setSaveRateMinutes(Number(e.target.value))}
                className="h-8 px-2 text-sm text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
              >
                {[5, 10, 15, 30, 60].map((m) => (
                  <option key={m} value={m}>{m} minutes</option>
                ))}
              </select>
            </Row>
          </>
        )}
      </Section>

      <Section label="Setup Wizard">
        <Row>
          <p className="text-sm text-fg-muted mb-3">
            Re-run the first-launch setup wizard — theme, assistant selection, CLI check, git identity,
            and (on macOS) the Automation permission prompt.
          </p>
          <button
            type="button"
            disabled={replaying}
            onClick={() => {
              setReplaying(true)
              useOnboardingStore.getState().replay().finally(() => setReplaying(false))
            }}
            className="self-start h-8 px-3 rounded border border-border text-sm text-fg hover:border-fg-subtle transition-colors disabled:opacity-50"
          >
            Run Setup Wizard
          </button>
        </Row>
      </Section>

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
