import { useState } from 'react'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { useGeneralSettingsStore } from '@/stores/generalSettingsStore'
import { Toggle } from '@/components/ui/Toggle'
import { Section, Row, TextField } from './SettingsLayout'

export function GeneralSettingsPage() {
  const [replaying, setReplaying] = useState(false)
  const openInBiggestPane = useGeneralSettingsStore((s) => s.openInBiggestPane)
  const setOpenInBiggestPane = useGeneralSettingsStore((s) => s.setOpenInBiggestPane)

  const [syncEnabled, setSyncEnabled] = useState(false)
  const [configRepoUrl, setConfigRepoUrl] = useState('')
  const [configRepoToken, setConfigRepoToken] = useState('')
  const [syncSettings, setSyncSettings] = useState<Record<string, boolean>>({
    general: true, models: true, git: true, docker: true,
    integrations: true, notes: true, todo: true, jira: true,
  })
  const [saveRate, setSaveRate] = useState(5)

  const syncItems = [
    { key: 'general', label: 'General' },
    { key: 'models', label: 'Models' },
    { key: 'git', label: 'Git' },
    { key: 'docker', label: 'Docker' },
    { key: 'integrations', label: 'Integrations' },
    { key: 'notes', label: 'Notes' },
    { key: 'todo', label: 'Todo' },
    { key: 'jira', label: 'Jira' },
  ]

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
            className="max-w-[60ch]"
            label="Enable vIDE Sync"
            description="Back up and restore your IDE settings and data via a private git repository you own."
            checked={syncEnabled}
            onChange={setSyncEnabled}
          />
        </Row>

        {syncEnabled && (
          <>
            <Row>
              <p className="text-sm text-fg-muted mb-3">
                Create a private repo on GitHub (or any Git host), then paste its URL and a personal access token below.
              </p>
              <TextField
                id="config-repo-url"
                label="Repository URL"
                value={configRepoUrl}
                onChange={setConfigRepoUrl}
                placeholder="https://github.com/you/vide-config.git"
                className="flex flex-col gap-1.5 max-w-md"
              />
              <TextField
                id="config-repo-token"
                label="Personal Access Token"
                type="password"
                value={configRepoToken}
                onChange={setConfigRepoToken}
                placeholder="ghp_••••••••••••••••"
                className="mt-3 flex flex-col gap-1.5 max-w-md"
              />
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  disabled={!configRepoUrl.trim() || !configRepoToken.trim()}
                  className="h-8 px-3 rounded border border-border text-sm text-fg hover:border-fg-subtle transition-colors disabled:opacity-40"
                >
                  Connect
                </button>
                <button
                  type="button"
                  disabled={!configRepoUrl.trim() || !configRepoToken.trim()}
                  className="h-8 px-3 rounded border border-border text-sm text-fg hover:border-fg-subtle transition-colors disabled:opacity-40"
                >
                  Sync
                </button>
              </div>
            </Row>

            <Row>
              <p className="text-sm text-fg mb-2">What to sync</p>
              <div className="flex flex-wrap gap-2">
                {syncItems.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSyncSettings((s) => ({ ...s, [key]: !s[key] }))}
                    className={[
                      'h-7 px-3 rounded-full text-sm border transition-colors',
                      syncSettings[key]
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
                value={saveRate}
                onChange={(e) => setSaveRate(Number(e.target.value))}
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
    </div>
  )
}
