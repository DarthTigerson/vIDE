import { useEffect } from 'react'
import { useModelSettingsStore } from '@/stores/modelSettingsStore'
import { CLAUDE_MODELS } from '@/stores/claudeModels'
import { useInlineEditSettingsStore } from '@/stores/inlineEditSettingsStore'
import { useCommitMessageSettingsStore } from '@/stores/commitMessageSettingsStore'
import { useUsagePassiveSettingsStore } from '@/stores/usagePassiveSettingsStore'
import { useEditorStore } from '@/stores/editorStore'
import { USAGE_GRAPH_TAB_PATH } from '@/components/Settings/paths'
import { Select } from '@/components/ui/Select'
import { FeatureBlock, SettingRow } from './FeatureBlock'
import { InlineEditPreview, CommitMessagePreview } from './previews/claudePreviews'

export function ClaudeSettingsPage() {
  const claudeEnabled = useModelSettingsStore((s) => s.enabled.claude)
  const setModelEnabled = useModelSettingsStore((s) => s.setEnabled)
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

  useEffect(() => {
    useUsagePassiveSettingsStore.getState().init()
  }, [])

  const modelOptions = CLAUDE_MODELS.map((m) => ({ value: m.id, label: m.label }))

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
              className="w-full resize-none rounded-lg border border-border bg-bg px-2 py-1.5 text-sm text-fg placeholder:text-fg-subtle focus:border-accent/60 focus:outline-hidden"
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
            className="h-8 rounded-sm border border-border px-3 text-sm text-fg transition-colors hover:border-fg-subtle"
          >
            Open Usage Graph
          </button>
        </FeatureBlock>
      </div>
    </div>
  )
}
