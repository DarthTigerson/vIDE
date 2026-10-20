import { useDisplayStore } from '@/stores/displayStore'
import { useBottomTerminalStore } from '@/stores/bottomTerminalStore'
import { FeatureBlock } from './FeatureBlock'
import { BottomTerminalPreview, MemoryPreview, NavbarPreview } from './previews/displayPreviews'
import { ThemeSection } from './ThemeSection'
import { PanelStyleSection } from './PanelStyleSection'
import { FontSection } from './FontSection'
import { EditorColorsSection } from './EditorColorsSection'
import { BackgroundSection } from './BackgroundSection'

export function DisplayPage() {
  const {
    memoryUsageVisible, navbarPosition,
    setMemoryUsageVisible, setNavbarPosition,
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
          title="Memory usage"
          description="Show how much RAM is in use, next to the model dropdown in the title bar."
          toggle={{ checked: memoryUsageVisible, onChange: setMemoryUsageVisible }}
          preview={<MemoryPreview />}
        />

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
