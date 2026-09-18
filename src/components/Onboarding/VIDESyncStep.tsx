import { useState } from 'react'
import { Toggle } from '@/components/ui/Toggle'
import { TextField } from '@/components/Settings/SettingsLayout'

export function VIDESyncStep() {
  const [enabled, setEnabled] = useState(false)
  const [repoUrl, setRepoUrl] = useState('')
  const [token, setToken] = useState('')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-fg">vIDE Sync</h2>
        <p className="text-xs text-fg-muted mt-0.5">
          Back up and restore your IDE settings and data via a private git repository you own.
          You can set this up later in Settings → General.
        </p>
      </div>

      <Toggle
        label="Enable vIDE Sync"
        description="Store your settings, themes, and data in a repo you control."
        checked={enabled}
        onChange={setEnabled}
      />

      {enabled && (
        <div className="flex flex-col gap-3 pl-4 border-l border-border/40">
          <TextField
            id="wizard-config-repo-url"
            label="Repository URL"
            value={repoUrl}
            onChange={setRepoUrl}
            placeholder="https://github.com/you/vide-config.git"
          />
          <TextField
            id="wizard-config-repo-token"
            label="Personal Access Token"
            type="password"
            value={token}
            onChange={setToken}
            placeholder="ghp_••••••••••••••••"
          />
          {repoUrl.trim() && token.trim() && (
            <button
              type="button"
              className="self-start h-8 px-3 rounded border border-border text-sm text-fg hover:border-fg-subtle transition-colors"
            >
              Connect
            </button>
          )}
        </div>
      )}
    </div>
  )
}
