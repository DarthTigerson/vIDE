import { useDisplayStore } from '@/stores/displayStore'
import { useBottomTerminalStore } from '@/stores/bottomTerminalStore'
import { FeatureBlock, SettingRow } from './FeatureBlock'
import { Switch } from '@/components/ui/Toggle'
import { BottomTerminalPreview, TitleBarPreview, NavbarPreview } from './previews/displayPreviews'
import { ThemeSection } from './ThemeSection'
import { PanelStyleSection } from './PanelStyleSection'
import { FontSection } from './FontSection'
import { EditorColorsSection } from './EditorColorsSection'
import { BackgroundSection } from './BackgroundSection'

export function DisplayPage() {
  const {
    memoryUsageVisible, batteryVisible, navbarPosition,
    setMemoryUsageVisible, setBatteryVisible, setNavbarPosition,
  } = useDisplayStore()
  const bottomTerminal = useBottomTerminalStore((s) => s.enabled)

  return (
    <div className="h-full overflow-auto bg-panel p-6">
      <div className="max-w-[1000px]">
        <h1 className="mb-1 text-base font-semibold text-fg">Display</h1>
        <p className="mb-4 text-sm text-fg-muted">Colour theme, fonts, and panel appearance.</p>

        <ThemeSection />
        <PanelStyleSection />
        <FontSection />
        <EditorColorsSection />
        <BackgroundSection />

        <FeatureBlock
          title="Title bar"
          description="What shows on the right of the title bar."
          preview={<TitleBarPreview />}
        >
          <SettingRow label="Memory usage" description="How much RAM is in use.">
            <Switch label="Memory usage" checked={memoryUsageVisible} onChange={setMemoryUsageVisible} />
          </SettingRow>
          <SettingRow label="Battery" description="Charge level. Never shown on machines without a battery.">
            <Switch label="Battery" checked={batteryVisible} onChange={setBatteryVisible} />
          </SettingRow>
        </FeatureBlock>

        <FeatureBlock
          title="Navbar on the right"
          description="Gabby Style: the Files, Git and Settings navbar and its panel move to the right edge, and the Claude navbar and chat swap to the left."
          toggle={{ checked: navbarPosition === 'right', onChange: (checked) => setNavbarPosition(checked ? 'right' : 'left') }}
          preview={<NavbarPreview />}
        />

        <FeatureBlock
          title="Bottom terminal"
          description="Lock this project's terminals into a panel under the editor, with tabs on up to two sides. Terminals already open move there and go back to their pane when it is turned off. Agent sessions stay in their bar. Also in the footer's display chip."
          toggle={{ checked: bottomTerminal, onChange: (on) => useBottomTerminalStore.getState().setEnabled(on) }}
          preview={<BottomTerminalPreview />}
        />
      </div>
    </div>
  )
}
