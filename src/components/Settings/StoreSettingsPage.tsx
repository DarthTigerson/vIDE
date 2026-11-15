import { useStoreSettingsStore } from '@/stores/storeSettingsStore'
import { useStoreStore } from '@/stores/storeStore'
import { FeatureBlock } from './FeatureBlock'
import { ghostPillClass } from '@/components/Store/storeUi'

export function StoreSettingsPage() {
  const enabled = useStoreSettingsStore((s) => s.installFromFile)
  const setEnabled = useStoreSettingsStore((s) => s.setInstallFromFile)
  const pickFile = useStoreStore((s) => s.pickFile)

  return (
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">Store</h1>
        <p className="mb-4 text-sm text-fg-muted">Apps from the vSuite Store.</p>

        <FeatureBlock
          title="Install apps from a file"
          description={'Adds "Install from file…" to the Store and the palette, for a package downloaded from vsuite.tech or built yourself. Apps installed this way don\'t update on their own.'}
          toggle={{ checked: enabled, onChange: setEnabled, label: 'Install apps from a file' }}
        >
          <button type="button" className={ghostPillClass} onClick={() => void pickFile()}>
            Install from file…
          </button>
        </FeatureBlock>
      </div>
    </div>
  )
}
