import { useEffect } from 'react'
import { useModelSettingsStore } from '@/stores/modelSettingsStore'
import { useAutocompleteSettingsStore, AUTOCOMPLETE_MODELS } from '@/stores/autocompleteSettingsStore'
import { useInlineEditSettingsStore } from '@/stores/inlineEditSettingsStore'
import { useCommitMessageSettingsStore } from '@/stores/commitMessageSettingsStore'
import { useUsagePassiveSettingsStore } from '@/stores/usagePassiveSettingsStore'
import { useNotificationSoundSettingsStore, NOTIFICATION_SOUND_OPTIONS, playNotificationSound } from '@/stores/notificationSoundSettingsStore'
import { useEditorStore } from '@/stores/editorStore'
import { USAGE_GRAPH_TAB_PATH } from '@/components/Settings/paths'
import { Toggle } from '@/components/ui/Toggle'
import { Select } from '@/components/ui/Select'
import { Section, Row, Field } from './SettingsLayout'

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
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Claude</h1>
      <p className="text-sm text-fg-muted mb-4">Claude Code and its model-powered features.</p>

      <Section label="General">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Claude"
            description="Show Claude Code in the model dropdown."
            checked={claudeEnabled}
            onChange={(value) => setModelEnabled('claude', value)}
          />
        </Row>
      </Section>

      <Section label="Notifications">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Play sound when Claude is done"
            description="Plays a sound when Claude finishes responding. Claude only, for now."
            checked={notificationSoundEnabled}
            onChange={setNotificationSoundEnabled}
          />

          {notificationSoundEnabled && (
            <div className="mt-3 flex items-end gap-2">
              <Field label="Sound">
                <Select
                  id="notification-sound-select"
                  value={notificationSoundId}
                  onChange={setNotificationSoundId}
                  options={NOTIFICATION_SOUND_OPTIONS.map((s) => ({ value: s.id, label: s.label }))}
                  ariaLabel="Sound"
                />
              </Field>
              <button
                type="button"
                onClick={() => playNotificationSound(notificationSoundId)}
                aria-label="Test sound"
                title="Test sound"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-fg hover:border-fg-subtle transition-colors"
              >
                <SpeakerIcon />
              </button>
            </div>
          )}
        </Row>
      </Section>

      <Section label="Model Features">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Inline Autocomplete"
            description="Temporarily disabled while we rework how this feature works (VIDE-16) — the current design has poor latency and burns subscription usage."
            checked={false}
            disabled
            onChange={() => {}}
          />
          <Field label="Model">
            <Select
              id="autocomplete-model"
              value={autocompleteModel}
              onChange={setAutocompleteModel}
              options={modelOptions}
              ariaLabel="Model"
              disabled
            />
          </Field>
        </Row>

        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Inline Edit (Cmd+K)"
            description="Select code (or place your cursor) and press Cmd+K to describe a change."
            checked={inlineEditEnabled}
            onChange={setInlineEditEnabled}
          />
          <Field label="Model">
            <Select
              id="inline-edit-model"
              value={inlineEditModel}
              onChange={setInlineEditModel}
              options={modelOptions}
              ariaLabel="Inline Edit Model"
            />
          </Field>
        </Row>

        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Commit Messages"
            description="Adds a button next to the commit message box in the Git panel that writes a message from your staged diff."
            checked={commitMessageEnabled}
            onChange={setCommitMessageEnabled}
          />
          <Field label="Model">
            <Select
              id="commit-message-model"
              value={commitMessageModel}
              onChange={setCommitMessageModel}
              options={modelOptions}
              ariaLabel="Commit Message Model"
            />
          </Field>
          <div className="mt-3 flex items-start gap-3">
            <label htmlFor="commit-message-prompt" className="text-xs text-fg-muted shrink-0 w-20 pt-2">Prompt</label>
            <textarea
              id="commit-message-prompt"
              value={commitMessagePrompt}
              onChange={(e) => setCommitMessagePrompt(e.target.value)}
              placeholder="Leave empty for the default prompt"
              rows={3}
              className="w-full max-w-xl resize-none px-2 py-1.5 text-sm text-fg bg-bg border border-border rounded-lg placeholder:text-fg-subtle focus:outline-none focus:border-accent/60"
            />
          </div>
        </Row>
      </Section>

      <Section label="Usage Monitoring">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Passive usage monitoring"
            description="Track Claude Code usage continuously in the background, even when the usage panel and mobile display are closed. Off by default — usage is otherwise only tracked while one of those is open. History collected this way is viewable in the Usage Graph tab."
            checked={passiveUsageEnabled}
            onChange={setPassiveUsageEnabled}
          />
          <div className="mt-3">
            <button
              type="button"
              onClick={() => useEditorStore.getState().openTab({ path: USAGE_GRAPH_TAB_PATH, content: '', dirty: false })}
              className="h-8 px-3 rounded border border-border text-sm text-fg hover:border-fg-subtle transition-colors"
            >
              Open Usage Graph
            </button>
          </div>
        </Row>
      </Section>
    </div>
  )
}
