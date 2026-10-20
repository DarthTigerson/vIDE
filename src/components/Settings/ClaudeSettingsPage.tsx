import { useEffect } from 'react'
import { useModelSettingsStore } from '@/stores/modelSettingsStore'
import { useAutocompleteSettingsStore, AUTOCOMPLETE_MODELS } from '@/stores/autocompleteSettingsStore'
import { useInlineEditSettingsStore } from '@/stores/inlineEditSettingsStore'
import { useCommitMessageSettingsStore } from '@/stores/commitMessageSettingsStore'
import { useUsagePassiveSettingsStore } from '@/stores/usagePassiveSettingsStore'
import { useNotificationSoundSettingsStore, NOTIFICATION_SOUND_OPTIONS, playNotificationSound } from '@/stores/notificationSoundSettingsStore'
import { useEditorStore } from '@/stores/editorStore'
import { USAGE_GRAPH_TAB_PATH } from '@/components/Settings/paths'
import { Select } from '@/components/ui/Select'
import { FeatureBlock, SettingRow } from './FeatureBlock'
import { ToolFolderRows } from './HiddenFolderControls'
import { AutocompletePreview, InlineEditPreview, CommitMessagePreview } from './previews/claudePreviews'

function SpeakerIcon() {
  return (
    <svg
      className="shrink-0"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4 9.5V14.5H8L13 18.5V5.5L8 9.5H4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M16.5 8.5C17.5 9.5 18 10.7 18 12C18 13.3 17.5 14.5 16.5 15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M19 6C20.7 7.7 21.5 9.8 21.5 12C21.5 14.2 20.7 16.3 19 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function ClaudeSettingsPage() {
  const claudeEnabled = useModelSettingsStore((s) => s.enabled.claude)
  const setModelEnabled = useModelSettingsStore((s) => s.setEnabled)
  const autocompleteModel = useAutocompleteSettingsStore((s) => s.model)
  const setAutocompleteModel = useAutocompleteSettingsStore((s) => s.setModel)
  const inlineEditEnabled = useInlineEditSettingsStore((s) => s.enabled)
  const setInlineEditEnabled = useInlineEditSettingsStore((s) => s.setEnabled)
  const inlineEditModel = useInlineEditSettingsStore((s) => s.model)
  const setInlineEditModel = useInlineEditSettingsStore((s) => s.setModel)
  const passiveUsageEnabled = useUsagePassiveSettingsStore((s) => s.enabled)
  const setPassiveUsageEnabled = useUsagePassiveSettingsStore((s) => s.setEnabled)
  const commitMessageEnabled = useCommitMessageSettingsStore((s) => s.enabled)
  const setCommitMessageEnabled = useCommitMessageSettingsStore((s) => s.setEnabled)
  const commitMessageModel = useCommitMessageSettingsStore((s) => s.model)
  const setCommitMessageModel = useCommitMessageSettingsStore((s) => s.setModel)
  const commitMessagePrompt = useCommitMessageSettingsStore((s) => s.prompt)
  const setCommitMessagePrompt = useCommitMessageSettingsStore((s) => s.setPrompt)
  const notificationSoundEnabled = useNotificationSoundSettingsStore((s) => s.enabled)
  const setNotificationSoundEnabled = useNotificationSoundSettingsStore((s) => s.setEnabled)
  const notificationSoundId = useNotificationSoundSettingsStore((s) => s.soundId)
  const setNotificationSoundId = useNotificationSoundSettingsStore((s) => s.setSoundId)

  useEffect(() => {
    useUsagePassiveSettingsStore.getState().init()
  }, [])

  const modelOptions = AUTOCOMPLETE_MODELS.map((m) => ({ value: m.id, label: m.label }))

  return (
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">Claude</h1>
        <p className="mb-4 text-sm text-fg-muted">Claude Code and its model-powered features.</p>

        <FeatureBlock
          title="Claude"
          description="Show Claude Code in the model dropdown."
          toggle={{ checked: claudeEnabled, onChange: (value) => setModelEnabled('claude', value), label: 'Claude' }}
        />

        <FeatureBlock
          title="Done sound"
          description="Play a sound when Claude finishes responding. Claude only, for now."
          toggle={{ checked: notificationSoundEnabled, onChange: setNotificationSoundEnabled, label: 'Play sound when Claude is done' }}
        >
          <SettingRow label="Sound" htmlFor="notification-sound-select">
            <div className="flex items-center gap-2">
              <div className="w-44">
                <Select
                  id="notification-sound-select"
                  value={notificationSoundId}
                  onChange={setNotificationSoundId}
                  options={NOTIFICATION_SOUND_OPTIONS.map((s) => ({ value: s.id, label: s.label }))}
                  ariaLabel="Sound"
                />
              </div>
              <button
                type="button"
                onClick={() => playNotificationSound(notificationSoundId)}
                aria-label="Test sound"
                title="Test sound"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-fg transition-colors hover:border-fg-subtle"
              >
                <SpeakerIcon />
              </button>
            </div>
          </SettingRow>
        </FeatureBlock>

        <FeatureBlock
          title="Inline autocomplete"
          description="Temporarily disabled while we rework how this works (VIDE-16): the current design has poor latency and burns subscription usage."
          toggle={{ checked: false, onChange: () => {}, label: 'Inline Autocomplete', disabled: true }}
          preview={<AutocompletePreview />}
        >
          <SettingRow label="Model">
            <div className="w-44">
              <Select id="autocomplete-model" value={autocompleteModel} onChange={setAutocompleteModel} options={modelOptions} ariaLabel="Model" disabled />
            </div>
          </SettingRow>
        </FeatureBlock>

        <FeatureBlock
          title="Inline edit (⌘K)"
          description="Select code, or place your cursor, and press ⌘K to describe a change."
          toggle={{ checked: inlineEditEnabled, onChange: setInlineEditEnabled, label: 'Inline Edit (Cmd+K)' }}
          preview={<InlineEditPreview />}
        >
          <SettingRow label="Model">
            <div className="w-44">
              <Select id="inline-edit-model" value={inlineEditModel} onChange={setInlineEditModel} options={modelOptions} ariaLabel="Inline Edit Model" />
            </div>
          </SettingRow>
        </FeatureBlock>

        <FeatureBlock
          title="Commit messages"
          description="A button next to the commit message box in the Git panel that writes a message from your staged diff."
          toggle={{ checked: commitMessageEnabled, onChange: setCommitMessageEnabled, label: 'Commit Messages' }}
          preview={<CommitMessagePreview />}
        >
          <SettingRow label="Model">
            <div className="w-44">
              <Select id="commit-message-model" value={commitMessageModel} onChange={setCommitMessageModel} options={modelOptions} ariaLabel="Commit Message Model" />
            </div>
          </SettingRow>
          <SettingRow label="Prompt" htmlFor="commit-message-prompt" stacked>
            <textarea
              id="commit-message-prompt"
              value={commitMessagePrompt}
              onChange={(e) => setCommitMessagePrompt(e.target.value)}
              placeholder="Leave empty for the default prompt"
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-bg px-2 py-1.5 text-sm text-fg placeholder:text-fg-subtle focus:border-accent/60 focus:outline-none"
            />
          </SettingRow>
        </FeatureBlock>

        <FeatureBlock
          title="Usage monitoring"
          description="Track Claude Code usage in the background, even with the usage panel and mobile display closed. Off by default: usage is otherwise only tracked while one of those is open. The history shows in the Usage Graph tab."
          toggle={{ checked: passiveUsageEnabled, onChange: setPassiveUsageEnabled, label: 'Passive usage monitoring' }}
          dimWhenOff={false}
        >
          <button
            type="button"
            onClick={() => useEditorStore.getState().openTab({ path: USAGE_GRAPH_TAB_PATH, content: '', dirty: false })}
            className="h-8 rounded border border-border px-3 text-sm text-fg transition-colors hover:border-fg-subtle"
          >
            Open Usage Graph
          </button>
        </FeatureBlock>

        <FeatureBlock
          title=".claude folder"
          description="Claude Code keeps project config (skills, settings, CLAUDE.md) in .claude. It's usually committed so the team shares it, so there's no gitignore option, but you can hide it from the file tree."
        >
          <ToolFolderRows name=".claude" />
        </FeatureBlock>
      </div>
    </div>
  )
}
