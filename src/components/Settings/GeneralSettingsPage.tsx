import { useState, useEffect } from 'react'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { useGeneralSettingsStore, type NewTabPane, type AgentBarMode } from '@/stores/generalSettingsStore'
import { useConfigRepoStore } from '@/stores/configRepoStore'
import { RadioGroup } from '@/components/ui/RadioGroup'
import { TextField } from './SettingsLayout'
import { FeatureBlock, SettingRow } from './FeatureBlock'
import { AgentBarPreview, NewTabPreview, SyncPreview } from './previews/generalPreviews'
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

  const newTabPane = useGeneralSettingsStore((s) => s.newTabPane)
  const setNewTabPane = useGeneralSettingsStore((s) => s.setNewTabPane)
  const agentBarMode = useGeneralSettingsStore((s) => s.agentBarMode)
  const setAgentBarMode = useGeneralSettingsStore((s) => s.setAgentBarMode)

  const {
    loaded,
    enabled, setEnabled,
    repoUrl, setRepoUrl,
    token, setToken,
    categories, toggleCategory,
    status, lastSyncAt, errorMessage,
    connect, push,
    load,
  } = useConfigRepoStore()

  useEffect(() => { if (!loaded) load() }, [loaded, load])

  return (
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">General</h1>
        <p className="mb-4 text-sm text-fg-muted">App-level setup and preferences.</p>

        <FeatureBlock
          title="Tabs"
          description="Where a newly opened tab lands when the editor is split. Applies to files, settings, Git, notes, todos and browser tabs; go to definition always stays in your window."
          preview={<NewTabPreview />}
        >
          <SettingRow label="Open new tabs in">
            <RadioGroup<NewTabPane>
              ariaLabel="Open new tabs in"
              value={newTabPane}
              onChange={setNewTabPane}
              options={[
                { value: 'active', label: 'Active window' },
                { value: 'biggest', label: 'Biggest window' },
              ]}
            />
          </SettingRow>
          <p className="max-w-[460px] text-xs text-fg-muted">
            {newTabPane === 'biggest'
              ? 'Tabs open in the largest editor window, so a small split never gets crowded.'
              : 'Tabs open in the window you last clicked in.'}
          </p>
        </FeatureBlock>

        <FeatureBlock
          title="Agent panel"
          description="How the Claude session bar beside the agent panel shows each session's name."
          preview={<AgentBarPreview />}
        >
          <SettingRow label="Session names">
            <RadioGroup<AgentBarMode>
              ariaLabel="Session names"
              value={agentBarMode}
              onChange={setAgentBarMode}
              options={[
                { value: 'collapse', label: 'Click to collapse' },
                { value: 'hover', label: 'Expand on hover' },
              ]}
            />
          </SettingRow>
          <p className="max-w-[460px] text-xs text-fg-muted">
            {agentBarMode === 'hover'
              ? 'The bar shows icons only and widens over the panel while you hover it.'
              : 'A small tab on the bar\'s inner edge, near the bottom, collapses it to icons or expands it to show names.'}
          </p>
        </FeatureBlock>

        <FeatureBlock
          title="vIDE Sync"
          description="Back up your settings, notes and todos to a private git repository you own, and keep several machines in step."
          toggle={{ checked: enabled, onChange: setEnabled }}
          preview={<SyncPreview items={SYNC_ITEMS} />}
        >
          {status !== 'idle' && (
            <div className="pb-2">
              <SyncStatusPill status={status} lastSyncAt={lastSyncAt} />
            </div>
          )}
          <ol className="mb-3 flex max-w-[52ch] list-inside list-decimal flex-col gap-1 text-xs text-fg-muted">
            <li>Create a <span className="font-medium text-fg">private</span> repository on GitHub (or any Git host).</li>
            <li>Generate a fine-grained personal access token scoped to <span className="font-medium text-fg">only that repository</span> with <span className="font-medium text-fg">Contents → Read and write</span> permission.</li>
            <li>Paste the repository URL and token below.</li>
          </ol>
          <TextField
            id="config-repo-url"
            label="Repository URL"
            value={repoUrl}
            onChange={setRepoUrl}
            placeholder="https://github.com/you/vide-config.git"
            className="flex max-w-[460px] flex-col gap-1.5 py-1.5"
          />
          <TextField
            id="config-repo-token"
            label="Personal Access Token"
            type="password"
            value={token}
            onChange={setToken}
            placeholder="ghp_••••••••••••••••"
            className="flex max-w-[460px] flex-col gap-1.5 py-1.5"
          />
          {errorMessage && <p className="mt-1 text-xs text-red-400">{errorMessage}</p>}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={!repoUrl.trim() || !token.trim() || status === 'connecting'}
              onClick={connect}
              className="h-8 rounded border border-border px-3 text-sm text-fg transition-colors hover:border-fg-subtle disabled:opacity-40"
            >
              {status === 'connecting' ? 'Connecting…' : 'Connect'}
            </button>
            <button
              type="button"
              disabled={status !== 'connected' && status !== 'error'}
              onClick={push}
              className="h-8 rounded border border-border px-3 text-sm text-fg transition-colors hover:border-fg-subtle disabled:opacity-40"
            >
              {status === 'pushing' ? 'Pushing…' : 'Push Now'}
            </button>
          </div>
          <p className="mb-2 mt-4 text-sm text-fg">What to sync</p>
          <div className="flex max-w-[460px] flex-wrap gap-2">
            {SYNC_ITEMS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleCategory(key)}
                className={[
                  'h-7 rounded-full border px-3 text-sm transition-colors',
                  categories[key]
                    ? 'border-accent/50 bg-accent/20 text-fg'
                    : 'border-border text-fg-muted hover:border-fg-subtle hover:text-fg',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
        </FeatureBlock>

        <FeatureBlock
          title="Setup wizard"
          description="Run the first-launch setup again: theme, assistant, CLI check, git identity and, on macOS, the Automation permission prompt."
        >
          <button
            type="button"
            disabled={replaying}
            onClick={() => {
              setReplaying(true)
              useOnboardingStore.getState().replay().finally(() => setReplaying(false))
            }}
            className="h-8 rounded border border-border px-3 text-sm text-fg transition-colors hover:border-fg-subtle disabled:opacity-50"
          >
            Run Setup Wizard
          </button>
        </FeatureBlock>
      </div>
    </div>
  )
}
