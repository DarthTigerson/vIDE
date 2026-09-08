import type { CSSProperties } from 'react'
import {
  useDisplayStore, basePanelColors, PANEL_STYLE_OPTIONS,
  type FooterContent,
} from '@/stores/displayStore'
import { useThemeStore } from '@/stores/themeStore'
import { Toggle } from '@/components/ui/Toggle'
import { Clock } from '@/components/StatusBar/Clock'
import { FOOTER_TIPS } from '@/lib/footerTips'
import { Section, Row } from './SettingsLayout'
import { ThemeSection } from './ThemeSection'
import { FontSection } from './FontSection'
import { EditorColorsSection } from './EditorColorsSection'
import { BackgroundSection } from './BackgroundSection'

const FOOTER_CONTENT_OPTIONS: { value: FooterContent; label: string }[] = [
  { value: 'hints', label: 'Hints' },
  { value: 'clock', label: 'Clock' },
]

// Mirrors the [data-panel-style="brushed-metal"] rule in index.css exactly.
// Can't just rely on that rule here — it deliberately excludes
// .panel-style-swatch (see below) so this preview isn't a live view of
// whichever style happens to be globally active — so the preview applies
// the same look directly via inline style instead.
const BRUSHED_METAL_PREVIEW_IMAGE = `repeating-linear-gradient(
  100deg,
  rgba(255, 255, 255, 0.12) 0px,
  rgba(255, 255, 255, 0.12) 1px,
  rgba(0, 0, 0, 0.07) 1px,
  rgba(0, 0, 0, 0.07) 2px
), linear-gradient(
  100deg,
  rgba(255, 255, 255, 0.16) 0%,
  rgba(255, 255, 255, 0) 28%,
  rgba(0, 0, 0, 0.06) 52%,
  rgba(255, 255, 255, 0.1) 76%,
  rgba(255, 255, 255, 0) 100%
)`
const brushedMetalPreviewStyle: CSSProperties = {
  backgroundImage: BRUSHED_METAL_PREVIEW_IMAGE,
  backgroundBlendMode: 'overlay, soft-light',
}

export function DisplayPage() {
  const {
    panelStyle, footerContent, memoryUsageVisible, navbarPosition,
    setPanelStyle, setFooterContent, setMemoryUsageVisible, setNavbarPosition,
  } = useDisplayStore()
  // Only read to force a re-render (and so basePanelColors() below picks up
  // the change) when the active theme changes elsewhere — its value isn't
  // used directly here.
  useThemeStore((s) => s.theme)
  const base = basePanelColors()

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
                  {/* Every colour below comes from `base` (basePanelColors()),
                      never a live var(--color-x) or a real bg-x utility class
                      — this is always a fixed mockup of `opt`'s own look, not
                      a live view of whichever panel style is actually active
                      app-wide. Those CSS vars are inherited, and Glossy/Glass/
                      Solid/Brush Metal each redefine some of them globally
                      while active, so reading them live here would make every
                      other option's preview shift to match whichever one is
                      currently selected. */}
                  <div className="h-14 relative overflow-hidden" style={{ background: base.bg }}>
                    {(opt.value === 'glossy' || opt.value === 'glass') && (
                      <>
                        {/* Stand-in "background image" behind the frosted panels —
                            without this there's nothing back there for the
                            backdrop-blur below to actually blur, so the effect
                            these two styles are named for wasn't visible at
                            this size. */}
                        <div className="absolute -left-3 -top-3 w-11 h-11 rounded-full bg-accent" />
                        <div className="absolute -right-2 -bottom-4 w-12 h-12 rounded-full bg-sky-400" />
                      </>
                    )}
                    {opt.value === 'glossy' ? (
                      <>
                        <div className="absolute left-0 top-0 bottom-0 w-7 backdrop-blur-md" style={{ background: `color-mix(in srgb, ${base.sidebar} 60%, transparent)` }} />
                        <div className="absolute left-7 top-0 right-0 h-5 backdrop-blur-md border-b" style={{ background: `color-mix(in srgb, ${base.tabBar} 70%, transparent)`, borderColor: `color-mix(in srgb, ${base.border} 40%, transparent)` }} />
                        <div className="absolute left-7 top-5 right-0 bottom-0 backdrop-blur-md" style={{ background: `color-mix(in srgb, ${base.panel} 60%, transparent)` }} />
                        {/* Diagonal sheen — the one thing that actually reads as
                            "glossy" rather than merely translucent. */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-transparent" />
                      </>
                    ) : opt.value === 'glass' ? (
                      <>
                        <div className="absolute left-0 top-0 bottom-0 w-7 backdrop-blur-sm" style={{ background: `color-mix(in srgb, ${base.sidebar} 15%, transparent)` }} />
                        <div className="absolute left-7 top-0 right-0 h-5 backdrop-blur-sm border-b" style={{ background: `color-mix(in srgb, ${base.tabBar} 20%, transparent)`, borderColor: `color-mix(in srgb, ${base.border} 30%, transparent)` }} />
                        <div className="absolute left-7 top-5 right-0 bottom-0 backdrop-blur-sm" style={{ background: `color-mix(in srgb, ${base.panel} 15%, transparent)` }} />
                      </>
                    ) : opt.value === 'solid' ? (
                      <>
                        <div className="absolute left-0 top-0 bottom-0 w-7 border-r-2 border-fg-subtle" style={{ background: base.sidebar }} />
                        <div className="absolute left-7 top-0 right-0 h-5 border-b-2 border-fg-subtle" style={{ background: base.tabBar }} />
                        <div className="absolute left-7 top-5 right-0 bottom-0" style={{ background: base.panel }} />
                      </>
                    ) : (
                      <>
                        <div
                          className="absolute left-0 top-0 bottom-0 w-7 border-r-2 border-fg-subtle"
                          style={{ background: base.sidebar, ...brushedMetalPreviewStyle }}
                        />
                        <div
                          className="absolute left-7 top-0 right-0 h-5 border-b-2 border-fg-subtle"
                          style={{ background: base.tabBar, ...brushedMetalPreviewStyle }}
                        />
                        <div
                          className="absolute left-7 top-5 right-0 bottom-0"
                          style={{ background: base.panel, ...brushedMetalPreviewStyle }}
                        />
                      </>
                    )}
                  </div>
                  <div className={['px-3 py-2', isActive ? 'bg-accent/10' : 'bg-sidebar'].join(' ')}>
                    <div className={['text-sm font-medium truncate', isActive ? 'text-fg' : 'text-fg-muted'].join(' ')}>
                      {opt.label}
                    </div>
                    <div className="text-xs text-fg-subtle mt-0.5 truncate">{opt.description}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </Section>

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
