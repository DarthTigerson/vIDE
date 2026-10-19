import { useEffect } from 'react'
import { useEditorSettingsStore, type MarkdownOpenMode } from '@/stores/editorSettingsStore'
import { Select } from '@/components/ui/Select'
import { LSP_SERVER_IDS } from '@/stores/lspSettingsStore'
import { useLspStatusStore, subscribeLspInstallEvents } from '@/stores/lspStatusStore'
import { LspServerRow } from './LspServerRow'
import { FeatureBlock, SettingRow } from './FeatureBlock'
import { AutocompleteSection } from './AutocompleteSection'
import {
  AutoSavePreview, WordWrapPreview, MarkdownPreview, GoToDefinitionPreview,
} from './previews/editorPreviews'

export function EditorSettingsPage() {
  const autoSaveEnabled = useEditorSettingsStore((s) => s.autoSaveEnabled)
  const setAutoSaveEnabled = useEditorSettingsStore((s) => s.setAutoSaveEnabled)
  const wordWrapEnabled = useEditorSettingsStore((s) => s.wordWrapEnabled)
  const setWordWrapEnabled = useEditorSettingsStore((s) => s.setWordWrapEnabled)
  const markdownOpenMode = useEditorSettingsStore((s) => s.markdownOpenMode)
  const setMarkdownOpenMode = useEditorSettingsStore((s) => s.setMarkdownOpenMode)
  const refreshLspStatus = useLspStatusStore((s) => s.refresh)

  useEffect(() => {
    subscribeLspInstallEvents()
    refreshLspStatus()
  }, [refreshLspStatus])

  return (
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">Editor</h1>
        <p className="mb-4 text-sm text-fg-muted">Editing behaviour for file tabs.</p>

        <FeatureBlock
          title="Auto save"
          description="Save the active file a moment after you stop typing."
          toggle={{ checked: autoSaveEnabled, onChange: setAutoSaveEnabled }}
          preview={<AutoSavePreview />}
        />

        <FeatureBlock
          title="Word wrap"
          description="Wrap long lines instead of scrolling sideways. Also ⌥Z, and shared with Git Log."
          toggle={{ checked: wordWrapEnabled, onChange: setWordWrapEnabled }}
          preview={<WordWrapPreview />}
        />

        <FeatureBlock
          title="Markdown files"
          description="What clicking a .md file in the file tree does. The right-click menu's Open / Edit and View in Markdown Viewer always do exactly what they say."
          preview={<MarkdownPreview />}
        >
          <SettingRow label="Open .md files in" htmlFor="markdown-open-mode">
            <div className="w-56">
              <Select
                id="markdown-open-mode"
                value={markdownOpenMode}
                onChange={(v) => setMarkdownOpenMode(v as MarkdownOpenMode)}
                options={[
                  { value: 'editor', label: 'Editor' },
                  { value: 'preview', label: 'Preview' },
                  { value: 'split', label: 'Both (editor left, preview right)' },
                ]}
              />
            </div>
          </SettingRow>
        </FeatureBlock>

        <AutocompleteSection />

        <FeatureBlock
          title="Go to definition"
          description="⌘-click a symbol to jump to where it's defined, backed by each language's own server. Off by default: a running server costs memory, so turn on only the languages you use."
          preview={<GoToDefinitionPreview />}
        >
          <div className="flex max-w-[560px] flex-col gap-4 pt-1">
            {LSP_SERVER_IDS.map((id) => (
              <LspServerRow key={id} id={id} />
            ))}
          </div>
        </FeatureBlock>
      </div>
    </div>
  )
}
