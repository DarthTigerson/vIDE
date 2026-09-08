import {
  useDisplayStore,
  type FooterContent,
} from '@/stores/displayStore'
import { Toggle } from '@/components/ui/Toggle'
import { Clock } from '@/components/StatusBar/Clock'
import { FOOTER_TIPS } from '@/lib/footerTips'
import { Section, Row } from './SettingsLayout'
import { ThemeSection } from './ThemeSection'
import { PanelStyleSection } from './PanelStyleSection'
import { FontSection } from './FontSection'
import { EditorColorsSection } from './EditorColorsSection'
import { BackgroundSection } from './BackgroundSection'

const FOOTER_CONTENT_OPTIONS: { value: FooterContent; label: string }[] = [
  { value: 'hints', label: 'Hints' },
  { value: 'clock', label: 'Clock' },
]

export function DisplayPage() {
  const {
    footerContent, memoryUsageVisible, navbarPosition,
    setFooterContent, setMemoryUsageVisible, setNavbarPosition,
  } = useDisplayStore()

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Display</h1>
      <p className="text-sm text-fg-muted mb-4">Colour theme, fonts, and panel appearance.</p>

      <ThemeSection />

      <PanelStyleSection />

      <FontSection />

      <EditorColorsSection />

      <BackgroundSection />

      {/* ── General ───────────────────────────────────────────────────────── */}
      <Section label="General">
        <Row>
          <div>
            <span className="text-sm text-fg mb-1.5 block">Footer Content</span>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3 max-w-[280px]">
              {FOOTER_CONTENT_OPTIONS.map((opt) => {
                const isActive = footerContent === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFooterContent(opt.value)}
                    className={[
                      'text-left rounded-lg border-2 overflow-hidden transition-colors',
                      isActive ? 'border-accent' : 'border-border hover:border-fg-muted',
                    ].join(' ')}
                  >
                    <div className="h-14 flex items-center justify-center bg-bg px-2">
                      {opt.value === 'clock' ? (
                        <Clock />
                      ) : (
                        <span className="text-xs text-fg-subtle text-center truncate">{FOOTER_TIPS[0]}</span>
                      )}
                    </div>
                    <div className={['px-3 py-2', isActive ? 'bg-accent/10' : 'bg-sidebar'].join(' ')}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={['text-sm font-medium truncate', isActive ? 'text-fg' : 'text-fg-muted'].join(' ')}>
                          {opt.label}
                        </span>
                        {isActive && (
                          <span className="shrink-0 text-xs font-medium text-accent px-1.5 py-0.5 rounded bg-accent/10">Active</span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </Row>

        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Show memory usage"
            description="Show the RAM used/total indicator next to the model dropdown in the title bar."
            checked={memoryUsageVisible}
            onChange={setMemoryUsageVisible}
          />
        </Row>

        <Row>
          <Toggle
            className="max-w-[60ch]"
            label="Navbar on the right (Gabby Style)"
            description="Move the Explorer/Git/Settings navbar and its panel to the right edge. The Claude navbar and chat panel swap to the left."
            checked={navbarPosition === 'right'}
            onChange={(checked) => setNavbarPosition(checked ? 'right' : 'left')}
          />
        </Row>
      </Section>
    </div>
  )
}
