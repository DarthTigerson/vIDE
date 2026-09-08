import type { CSSProperties } from 'react'
import { useDisplayStore, basePanelColors, PANEL_STYLE_OPTIONS } from '@/stores/displayStore'
import { useThemeStore } from '@/stores/themeStore'
import { Section } from './SettingsLayout'

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

// The bare card grid, with no Section wrapper — shared by the Display
// settings page (wrapped in PanelStyleSection below) and the setup wizard's
// ThemeStep, so both pickers show the exact same live previews rather than
// the wizard falling back to a plain text dropdown.
export function PanelStyleGrid() {
  const panelStyle = useDisplayStore((s) => s.panelStyle)
  const setPanelStyle = useDisplayStore((s) => s.setPanelStyle)
  // Only read to force a re-render (and so basePanelColors() below picks up
  // the change) when the active theme changes elsewhere — its value isn't
  // used directly here.
  useThemeStore((s) => s.theme)
  const base = basePanelColors()

  return (
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
  )
}

export function PanelStyleSection() {
  return (
    <Section label="Panel Style">
      <div className="pb-4 pl-3">
        <PanelStyleGrid />
      </div>
    </Section>
  )
}
