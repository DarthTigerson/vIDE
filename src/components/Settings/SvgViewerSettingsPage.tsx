import { useExtensionsStore, type SvgMode } from '@/stores/extensionsStore'
import { RadioGroup } from '@/components/ui/RadioGroup'
import { FeatureBlock, SettingRow } from './FeatureBlock'

export function SvgViewerSettingsPage() {
  const enabled = useExtensionsStore((s) => s.enabled['svg-viewer'])
  const setEnabled = useExtensionsStore((s) => s.setEnabled)
  const defaultMode = useExtensionsStore((s) => s.svgDefaultMode)
  const setDefaultMode = useExtensionsStore((s) => s.setSvgDefaultMode)

  return (
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">SVG Viewer</h1>
        <p className="mb-4 text-sm text-fg-muted">An extension that changes how SVG files open. It has no activity-bar icon.</p>

        <FeatureBlock
          title="SVG viewer"
          description="Opens SVG files rendered instead of as XML text. While it is off, opening an SVG asks you to turn it on, or to open it as text."
          toggle={{ checked: enabled, onChange: (value) => setEnabled('svg-viewer', value), label: 'Enable SVG viewer' }}
        >
          <SettingRow
            label="Default view"
            description="Toggle flips between the picture and the XML source, split shows both side by side. Every SVG tab can change its own view."
          >
            <RadioGroup<SvgMode>
              ariaLabel="Default SVG view"
              value={defaultMode}
              onChange={setDefaultMode}
              options={[
                { value: 'preview', label: 'Preview' },
                { value: 'toggle', label: 'Toggle' },
                { value: 'split', label: 'Split' },
              ]}
            />
          </SettingRow>
        </FeatureBlock>
      </div>
    </div>
  )
}
