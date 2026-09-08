import { useRef, useState } from 'react'
import {
  useDisplayStore, FONT_PRESETS, PANEL_STYLE_OPTIONS, BACKGROUND_IMAGE_OPTIONS,
  type FooterContent, type BackgroundImage,
} from '@/stores/displayStore'
import { useThemeStore, THEME_OPTIONS } from '@/stores/themeStore'
import { useCustomThemeStore, CUSTOM_COLOR_VARS } from '@/stores/customThemeStore'
import { Toggle } from '@/components/ui/Toggle'
import { Select } from '@/components/ui/Select'
import { Section, Row } from './SettingsLayout'

const FOOTER_CONTENT_OPTIONS: { value: FooterContent; label: string }[] = [
  { value: 'hints', label: 'Hints' },
  { value: 'clock', label: 'Clock' },
]

// _theme is passed in (not used) so callers that subscribe to useThemeStore
// trigger a re-render when the active theme changes, which causes this
// function to re-read the newly applied CSS custom properties.
function getComputedHex(varName: string, isAccent: boolean, _theme: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (isAccent) {
    const parts = raw.split(/\s+/).map(Number)
    if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
      return '#' + parts.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')
    }
    return '#808080'
  }
  return raw.startsWith('#') ? raw : '#000000'
}

function ColorPickerRow({ varName, label, isAccent }: { varName: string; label: string; isAccent: boolean }) {
  const override = useCustomThemeStore((s) => s.overrides[varName])
  const setOverride = useCustomThemeStore((s) => s.setOverride)
  const clearOverride = useCustomThemeStore((s) => s.clearOverride)
  const theme = useThemeStore((s) => s.theme)
  const swatchInputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<string | null>(null)

  const isOverridden = override !== undefined
  const effectiveHex = override ?? getComputedHex(varName, isAccent, theme)
  const displayValue = draft ?? effectiveHex

  function commit(raw: string) {
    const cleaned = raw.startsWith('#') ? raw : `#${raw}`
    if (/^#[0-9a-fA-F]{6}$/.test(cleaned)) {
      setOverride(varName, cleaned.toLowerCase())
    }
    setDraft(null)
  }

  return (
    <div className="flex items-center gap-3 py-1.5">
      {/* Swatch — clicking forwards to the hidden native colour picker */}
      <button
        type="button"
        className="w-6 h-6 rounded border border-border shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
        style={{ background: effectiveHex }}
        onClick={() => swatchInputRef.current?.click()}
        title={`Pick ${label} colour`}
      />
      <input
        ref={swatchInputRef}
        type="color"
        value={effectiveHex}
        onChange={(e) => setOverride(varName, e.target.value)}
        className="sr-only"
      />

      <span className="w-28 shrink-0 text-sm text-fg">{label}</span>

      {/* Editable hex field */}
      <input
        type="text"
        value={displayValue}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setDraft(null)
        }}
        spellCheck={false}
        className="w-24 h-6 px-1.5 text-xs font-mono text-fg bg-bg border border-border rounded focus:outline-none focus:border-accent/60"
      />

      {isOverridden && (
        <button
          type="button"
          onClick={() => clearOverride(varName)}
          className="text-xs text-fg-subtle hover:text-fg transition-colors"
        >
          Reset
        </button>
      )}
    </div>
  )
}

export function DisplayPage() {
  const {
    font, panelStyle, footerContent, memoryUsageVisible, backgroundImage, navbarPosition,
    setFont, setPanelStyle, setFooterContent, setMemoryUsageVisible, setBackgroundImage, setNavbarPosition,
  } = useDisplayStore()
  const { theme, setTheme, matchSystem, setMatchSystem } = useThemeStore()
  const clearAll = useCustomThemeStore((s) => s.clearAll)
  const overrides = useCustomThemeStore((s) => s.overrides)
  const hasOverrides = Object.keys(overrides).length > 0

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Display</h1>
      <p className="text-sm text-fg-muted mb-4">Colour theme, fonts, and panel appearance.</p>

      {/* ── Theme ─────────────────────────────────────────────────────────── */}
      <Section label="Theme">
        <div className="pb-4 pl-3">
          <Toggle
            className="max-w-[60ch] mb-5"
            label="Match system appearance"
            description="Automatically switch this theme between its light and dark variant when macOS does."
            checked={matchSystem}
            onChange={setMatchSystem}
          />
          <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
            {THEME_OPTIONS.map((t) => {
              const isActive = t.id === theme
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  className={[
                    'text-left rounded-lg border-2 p-3 transition-colors',
                    isActive ? 'border-accent' : 'border-border hover:border-fg-muted',
                  ].join(' ')}
                >
                  <div className="flex gap-1 mb-3 rounded overflow-hidden h-10">
                    {t.swatches.map((color, i) => (
                      <div key={i} className="flex-1" style={{ background: color }} />
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-fg truncate">{t.name}</span>
                    {isActive && (
                      <span className="shrink-0 text-xs font-medium text-accent px-1.5 py-0.5 rounded bg-accent/10">
                        Active
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </Section>

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

      {/* ── Custom Colours ────────────────────────────────────────────────── */}
      <Section label="Custom Colours">
        <Row>
          <div className="flex items-start justify-between gap-4 mb-3">
            <p className="text-sm text-fg-muted">
              Override individual colours on top of the active theme. Changes are live — click a swatch or type a hex value.
            </p>
            {hasOverrides && (
              <button
                type="button"
                onClick={clearAll}
                className="shrink-0 text-xs text-fg-subtle hover:text-fg transition-colors"
              >
                Reset all
              </button>
            )}
          </div>
          <div className="flex flex-col">
            {CUSTOM_COLOR_VARS.map((def) => (
              <ColorPickerRow
                key={def.varName}
                varName={def.varName}
                label={def.label}
                isAccent={def.isAccent}
              />
            ))}
          </div>
        </Row>
      </Section>
    </div>
  )
}
