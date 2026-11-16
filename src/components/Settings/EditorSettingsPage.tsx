import { useEffect } from 'react'
import { useEditorSettingsStore, type MarkdownOpenMode } from '@/stores/editorSettingsStore'
import { Select } from '@/components/ui/Select'
import { useLspStatusStore, subscribeLspEvents } from '@/stores/lspStatusStore'
import { useStoreStore } from '@/stores/storeStore'
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
  const svgOpenMode = useEditorSettingsStore((s) => s.svgOpenMode)
  const setSvgOpenMode = useEditorSettingsStore((s) => s.setSvgOpenMode)
  const refreshLspStatus = useLspStatusStore((s) => s.refresh)
  const installedServers = useLspStatusStore((s) => s.installed)
  const serversLoaded = useLspStatusStore((s) => s.loaded)
  const openStore = useStoreStore((s) => s.openWithCategory)

  useEffect(() => {
    subscribeLspEvents()
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

        <FeatureBlock
          title="SVG files"
          description="What clicking a .svg file in the file tree does. The right-click menu's Open / Edit and View in SVG Viewer always do exactly what they say."
        >
          <SettingRow label="Open .svg files in" htmlFor="svg-open-mode">
            <div className="w-56">
              <Select
                id="svg-open-mode"
                value={svgOpenMode}
                onChange={(v) => setSvgOpenMode(v as MarkdownOpenMode)}
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
          description="⌘-click a symbol to jump to where it's defined — plus autocomplete and hover docs — backed by each language's own server. Install the languages you use from the Store; a running server costs memory."
          preview={<GoToDefinitionPreview />}
        >
          <div className="flex max-w-[600px] flex-col gap-3 pt-1">
            {serversLoaded && installedServers.length === 0 ? (
              <p className="text-sm text-fg-muted">No language servers installed yet.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
                    <th className="pb-2 pr-4">Language</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Memory</th>
                    <th className="pb-2 pr-4 text-right">Enabled</th>
                    <th className="pb-2 text-right" aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {installedServers.map((server) => (
                    <LspServerRow key={server.entry.id} server={server} />
                  ))}
                </tbody>
              </table>
            )}
            <button
              type="button"
              className="self-start rounded-lg border border-border px-3 py-1 text-sm text-fg transition-colors hover:border-fg-subtle"
              onClick={() => openStore('language-servers')}
            >
              Get language servers in the Store
            </button>
          </div>
        </FeatureBlock>
      </div>
    </div>
  )
}
