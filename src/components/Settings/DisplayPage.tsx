import {
  useDisplayStore, FONT_PRESETS, PANEL_STYLE_OPTIONS, BACKGROUND_IMAGE_OPTIONS,
  type FooterContent, type BackgroundImage,
} from '@/stores/displayStore'
import { Toggle } from '@/components/ui/Toggle'
import { Select } from '@/components/ui/Select'
import { Section, Row } from './SettingsLayout'
import { ThemeSection } from './ThemeSection'

const FOOTER_CONTENT_OPTIONS: { value: FooterContent; label: string }[] = [
  { value: 'hints', label: 'Hints' },
  { value: 'clock', label: 'Clock' },
]

export function DisplayPage() {
  const {
    font, panelStyle, footerContent, memoryUsageVisible, backgroundImage, navbarPosition,
    setFont, setPanelStyle, setFooterContent, setMemoryUsageVisible, setBackgroundImage, setNavbarPosition,
  } = useDisplayStore()

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Display</h1>
      <p className="text-sm text-fg-muted mb-4">Colour theme, fonts, and panel appearance.</p>

      <ThemeSection />

      {/* ── Panel Style ───────────────────────────────────────────────────── */}
      <Section label="Panel Style">
        <div className="pb-4 pl-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
            {PANEL_STYLE_OPTIONS.map((opt) => {
              const isActive = panelStyle === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPanelStyle(opt.value)}
                  className={[
                    'text-left rounded-lg border-2 overflow-hidden transition-colors',
                    isActive ? 'border-accent' : 'border-border hover:border-fg-muted',
                  ].join(' ')}
                >
                  <div className="h-14 relative overflow-hidden bg-bg">
                    {opt.value === 'glass' && (
                      <div className="absolute right-1 bottom-0 w-6 h-6 rounded-full bg-accent/70 blur-[3px]" />
                    )}
                    {opt.value === 'glossy' ? (
                      <>
                        <div className="absolute left-0 top-0 bottom-0 w-7 bg-sidebar/50 backdrop-blur-sm" />
                        <div className="absolute left-7 top-0 right-0 h-5 bg-tab-bar/60 backdrop-blur-sm border-b border-border/40" />
                        <div className="absolute left-7 top-5 right-0 bottom-0 bg-panel/50 backdrop-blur-sm" />
                      </>
                    ) : opt.value === 'glass' ? (
                      <>
                        <div className="absolute left-0 top-0 bottom-0 w-7 bg-sidebar/20 backdrop-blur-sm" />
                        <div className="absolute left-7 top-0 right-0 h-5 bg-tab-bar/25 backdrop-blur-sm border-b border-border/30" />
                        <div className="absolute left-7 top-5 right-0 bottom-0 bg-panel/20 backdrop-blur-sm" />
                      </>
                    ) : opt.value === 'solid' ? (
                      <>
                        <div className="absolute left-0 top-0 bottom-0 w-7 bg-sidebar border-r-2 border-fg-subtle" />
                        <div className="absolute left-7 top-0 right-0 h-5 bg-tab-bar border-b-2 border-fg-subtle" />
                        <div className="absolute left-7 top-5 right-0 bottom-0 bg-panel" />
                      </>
                    ) : (
                      <>
                        <div className="absolute left-0 top-0 bottom-0 w-7 bg-sidebar" />
                        <div className="absolute left-7 top-0 right-0 h-5 bg-tab-bar border-b border-border" />
                        <div className="absolute left-7 top-5 right-0 bottom-0 bg-panel" />
                      </>
                    )}
                  </div>
                  <div className={['px-3 py-2', isActive ? 'bg-accent/10' : 'bg-sidebar'].join(' ')}>
                    <div className={['text-sm font-medium', isActive ? 'text-fg' : 'text-fg-muted'].join(' ')}>
                      {opt.label}
                    </div>
                    <div className="text-xs text-fg-subtle mt-0.5">{opt.description}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </Section>

      {/* ── General ───────────────────────────────────────────────────────── */}
      <Section label="General">
        <Row>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1.5 min-w-[180px]">
              <label htmlFor="footer-content-select" className="text-sm text-fg">Footer Content</label>
              <Select
                id="footer-content-select"
                value={footerContent}
                onChange={(v) => setFooterContent(v as FooterContent)}
                options={FOOTER_CONTENT_OPTIONS}
              />
            </div>
            <div className="flex flex-col gap-1.5 min-w-[180px]">
              <label htmlFor="font-select" className="text-sm text-fg">Font</label>
              <Select
                id="font-select"
                value={font}
                onChange={setFont}
                options={FONT_PRESETS.map((p) => ({ value: p.value, label: p.label, style: { fontFamily: p.value } }))}
              />
            </div>
            <div className="flex flex-col gap-1.5 min-w-[180px]">
              <label htmlFor="background-image-select" className="text-sm text-fg">Background Image</label>
              <Select
                id="background-image-select"
                value={backgroundImage}
                onChange={(v) => setBackgroundImage(v as BackgroundImage)}
                options={BACKGROUND_IMAGE_OPTIONS}
              />
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
            label="Navbar on right"
            description="Move the Explorer/Git/Settings navbar and its panel to the right edge. The Claude navbar and chat panel swap to the left."
            checked={navbarPosition === 'right'}
            onChange={(checked) => setNavbarPosition(checked ? 'right' : 'left')}
          />
        </Row>
      </Section>
    </div>
  )
}
