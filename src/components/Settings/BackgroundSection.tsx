import { useDisplayStore, BACKGROUND_IMAGE_OPTIONS, type BackgroundImage } from '@/stores/displayStore'
import { EMPTY_EDITOR_BACKGROUNDS } from '@/assets/emptyEditorBackgrounds'
import { Section } from './SettingsLayout'

// The bare card grid, with no Section wrapper — shared by the Display
// settings page (wrapped in BackgroundSection below) and the setup wizard's
// ThemeStep, so both pickers show the exact same image previews rather than
// the wizard falling back to a plain text dropdown.
export function BackgroundGrid() {
  const backgroundImage = useDisplayStore((s) => s.backgroundImage)
  const setBackgroundImage = useDisplayStore((s) => s.setBackgroundImage)

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
      {BACKGROUND_IMAGE_OPTIONS.map((opt) => {
        const isActive = backgroundImage === opt.value
        const image = opt.value === 'none' ? null : EMPTY_EDITOR_BACKGROUNDS[opt.value as Exclude<BackgroundImage, 'none'>]
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setBackgroundImage(opt.value)}
            className={[
              'text-left rounded-lg border-2 overflow-hidden transition-colors',
              isActive ? 'border-accent' : 'border-border hover:border-fg-muted',
            ].join(' ')}
          >
            <div className="h-14 relative overflow-hidden bg-bg">
              {image && (
                <div
                  className="absolute inset-0 bg-no-repeat"
                  style={{ backgroundImage: `url(${image})`, backgroundSize: 'cover', backgroundPosition: 'center right' }}
                />
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
  )
}

export function BackgroundSection() {
  return (
    <Section label="Background">
      <div className="pb-4 pl-3">
        <BackgroundGrid />
      </div>
    </Section>
  )
}
