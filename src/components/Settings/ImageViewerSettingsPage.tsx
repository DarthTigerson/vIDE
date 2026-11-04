import { useExtensionsStore } from '@/stores/extensionsStore'
import { FeatureBlock } from './FeatureBlock'

export function ImageViewerSettingsPage() {
  const enabled = useExtensionsStore((s) => s.enabled['image-viewer'])
  const setEnabled = useExtensionsStore((s) => s.setEnabled)

  return (
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">Image Viewer</h1>
        <p className="mb-4 text-sm text-fg-muted">An extension that changes how images open. It has no activity-bar icon.</p>

        <FeatureBlock
          title="Image viewer"
          description="Opens PNG, JPEG, GIF, BMP, WebP, AVIF, ICO, TIFF and HEIC files as pictures. While it is off, opening one of these files asks you to turn it on."
          toggle={{ checked: enabled, onChange: (value) => setEnabled('image-viewer', value), label: 'Enable Image viewer' }}
        />
      </div>
    </div>
  )
}
