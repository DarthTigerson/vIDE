import { useThemeStore, THEME_OPTIONS, familyOf } from '@/stores/themeStore'
import { useCustomThemeStore } from '@/stores/customThemeStore'
import { Select } from '@/components/ui/Select'
import { RadioGroup } from '@/components/ui/RadioGroup'
import { PanelStyleGrid } from '@/components/Settings/PanelStyleSection'
import { BackgroundGrid } from '@/components/Settings/BackgroundSection'

const FAMILIES = [
  { value: 'claude', label: 'Claude' },
  { value: 'thomas', label: 'vIDE' },
  { value: 'link', label: 'Link' },
  { value: 'atreus', label: 'Atreus' },
  { value: 'luuk', label: 'Luuk' },
  { value: 'borahae', label: 'Borahae' },
  { value: 'gabriele', label: 'Gabriele' },
]

const VARIANT_OPTIONS: { value: 'light' | 'dark' | 'system'; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

function SwatchPreview({ themeId, swatches, active, onClick }: {
  themeId: string
  swatches: string[]
  active: boolean
  onClick: () => void
}) {
  const label = themeId.endsWith('-dark') ? 'Dark' : 'Light'
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex-1 text-left rounded-lg border-2 p-3 transition-colors',
        active ? 'border-accent' : 'border-border hover:border-fg-muted',
      ].join(' ')}
    >
      <div className="flex gap-1 mb-2 rounded overflow-hidden h-9">
        {swatches.map((color, i) => (
          <div key={i} className="flex-1" style={{ background: color }} />
        ))}
      </div>
      <span className="text-xs font-medium text-fg">{label}</span>
    </button>
  )
}

export function ThemeStep() {
  const { theme, matchSystem, setFamily, setVariant, setMatchSystem } = useThemeStore()
  const setActiveCustom = useCustomThemeStore((s) => s.setActive)

  const family = familyOf(theme)
  const variant: 'light' | 'dark' | 'system' = matchSystem ? 'system' : theme.endsWith('-dark') ? 'dark' : 'light'

  const lightOption = THEME_OPTIONS.find((t) => t.id === `${family}-light`)!
  const darkOption = THEME_OPTIONS.find((t) => t.id === `${family}-dark`)!

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-sm font-semibold text-fg">Pick a theme</h2>
        <p className="text-xs text-fg-muted mt-0.5">You can change this later in Display settings.</p>
      </div>

      <div>
        <label htmlFor="onboarding-theme-family" className="text-xs text-fg-muted mb-1.5 block">Colour family</label>
        <Select
          id="onboarding-theme-family"
          value={family}
          onChange={(v) => { setActiveCustom(null); setFamily(v) }}
          options={FAMILIES}
        />
      </div>

      <div className="flex gap-3">
        <SwatchPreview
          themeId={lightOption.id}
          swatches={lightOption.swatches}
          active={variant === 'light'}
          onClick={() => { setActiveCustom(null); setVariant(false) }}
        />
        <SwatchPreview
          themeId={darkOption.id}
          swatches={darkOption.swatches}
          active={variant === 'dark'}
          onClick={() => { setActiveCustom(null); setVariant(true) }}
        />
      </div>

      <div>
        <span className="text-xs text-fg-muted mb-1.5 block">Appearance</span>
        <RadioGroup
          ariaLabel="Appearance"
          value={variant}
          onChange={(v) => {
            if (v === 'system') { setMatchSystem(true); return }
            setActiveCustom(null)
            setVariant(v === 'dark')
          }}
          options={VARIANT_OPTIONS}
        />
      </div>

      <div className="pt-1 border-t border-border/40 flex flex-col gap-4">
        <div className="pt-4">
          <span className="text-xs text-fg-muted mb-1.5 block">Panel style</span>
          <PanelStyleGrid />
        </div>

        <div>
          <span className="text-xs text-fg-muted mb-1.5 block">Background image</span>
          <BackgroundGrid />
        </div>
      </div>
    </div>
  )
}
