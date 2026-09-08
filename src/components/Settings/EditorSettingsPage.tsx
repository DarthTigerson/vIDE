import { useEffect } from 'react'
import { useEditorSettingsStore } from '@/stores/editorSettingsStore'
import { Toggle } from '@/components/ui/Toggle'
import { LSP_SERVER_IDS } from '@/stores/lspSettingsStore'
import { useLspStatusStore, subscribeLspInstallEvents } from '@/stores/lspStatusStore'
import { LspServerRow } from './LspServerRow'
import { Section, Row } from './SettingsLayout'

export function EditorSettingsPage() {
  const autoSaveEnabled = useEditorSettingsStore((s) => s.autoSaveEnabled)
  const setAutoSaveEnabled = useEditorSettingsStore((s) => s.setAutoSaveEnabled)
  const wordWrapEnabled = useEditorSettingsStore((s) => s.wordWrapEnabled)
  const setWordWrapEnabled = useEditorSettingsStore((s) => s.setWordWrapEnabled)
  const changeAllOccurrencesInMenu = useEditorSettingsStore((s) => s.changeAllOccurrencesInMenu)
  const setChangeAllOccurrencesInMenu = useEditorSettingsStore((s) => s.setChangeAllOccurrencesInMenu)
  const openInBiggestPane = useEditorSettingsStore((s) => s.openInBiggestPane)
  const setOpenInBiggestPane = useEditorSettingsStore((s) => s.setOpenInBiggestPane)
  const refreshLspStatus = useLspStatusStore((s) => s.refresh)

  useEffect(() => {
    subscribeLspInstallEvents()
    refreshLspStatus()
  }, [refreshLspStatus])

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Editor</h1>
      <p className="text-sm text-fg-muted mb-4">Editing behaviour for file tabs.</p>

      <Section label="General">
        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Auto Save"
            description="Automatically save the active file shortly after changes."
            checked={autoSaveEnabled}
            onChange={setAutoSaveEnabled}
          />
        </Row>

        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Word Wrap"
            description="Wrap long lines instead of scrolling horizontally. Also toggleable with ⌥Z. Shared with Git Log."
            checked={wordWrapEnabled}
            onChange={setWordWrapEnabled}
          />
        </Row>

        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Always open in biggest pane"
            description="If the editor is split into multiple panes, open files from the file tree in whichever pane currently has the most space, instead of the focused one."
            checked={openInBiggestPane}
            onChange={setOpenInBiggestPane}
          />
        </Row>

        <Row>
          <Toggle
            className="max-w-[60ch]"
            label={'Show "Change All Occurrences" in right-click menu'}
            description="⌘F2 still works either way — this only hides the menu entry."
            checked={changeAllOccurrencesInMenu}
            onChange={setChangeAllOccurrencesInMenu}
          />
        </Row>
      </Section>

      <Section label="Language Intelligence">
        <Row>
          <p className="text-sm text-fg-muted mb-3">
            Cmd+click go-to-definition, backed by each language's own language server. Off by
            default since a running server has a real memory cost — enable only the languages
            you use.
          </p>
          <div className="flex flex-col gap-4">
            {LSP_SERVER_IDS.map((id) => (
              <LspServerRow key={id} id={id} />
            ))}
          </div>
        </Row>
      </Section>
    </div>
  )
}
