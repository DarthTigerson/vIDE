import { useEditorSettingsStore } from '@/stores/editorSettingsStore'
import { RadioGroup } from '@/components/ui/RadioGroup'
import { AutoSavePreview } from '@/components/Settings/previews/editorPreviews'

export function EditorStep() {
  const autoSaveEnabled = useEditorSettingsStore((s) => s.autoSaveEnabled)
  const setAutoSaveEnabled = useEditorSettingsStore((s) => s.setAutoSaveEnabled)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-fg">Auto save files?</h2>
        <p className="text-xs text-fg-muted mt-0.5">
          With auto save on, the active file is saved a moment after you stop typing. With it off,
          files stay unsaved until you press ⌘S. Change this anytime in Settings → Editor.
        </p>
      </div>

      <RadioGroup
        ariaLabel="Auto save"
        value={autoSaveEnabled ? 'on' : 'off'}
        onChange={(v) => setAutoSaveEnabled(v === 'on')}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'on', label: 'On' },
        ]}
      />

      <AutoSavePreview />
    </div>
  )
}
