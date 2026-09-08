import { useDisplayStore, FONT_PRESETS } from '@/stores/displayStore'
import { useFontSizeStore } from '@/stores/fontSizeStore'
import { Section } from './SettingsLayout'

// Same pill styling/icons as the footer's own font-size control
// (StatusBar.tsx) — this is the same global useFontSizeStore, just also
// reachable from Settings instead of only the footer.
function MinusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function FontSection() {
  const font = useDisplayStore((s) => s.font)
  const setFont = useDisplayStore((s) => s.setFont)
  const { fontSize, increase, decrease, reset } = useFontSizeStore()

  return (
    <Section label="Font">
      <div className="pb-4 pl-3">
        <div className="mb-5 flex items-center justify-between gap-4 max-w-[60ch]">
          <div>
            <div className="text-sm text-fg">Size</div>
            <div className="text-xs text-fg-muted mt-0.5">
              Scales UI text app-wide (file tree, tabs, labels). Editor and terminal font size are set separately.
            </div>
          </div>
          <div className="flex items-center rounded-full border border-border bg-bg overflow-hidden shrink-0">
            <button
              type="button"
              onClick={decrease}
              aria-label="Decrease font size"
              className="flex h-6 w-7 items-center justify-center text-fg-muted hover:text-fg hover:bg-white/5"
            >
              <MinusIcon />
            </button>
            <button
              type="button"
              onClick={reset}
              aria-label="Reset font size"
              title="Reset font size"
              className="flex h-6 min-w-[2rem] items-center justify-center border-x border-border px-1 text-xs tabular-nums text-fg-muted hover:text-fg hover:bg-white/5"
            >
              {fontSize}
            </button>
            <button
              type="button"
              onClick={increase}
              aria-label="Increase font size"
              className="flex h-6 w-7 items-center justify-center text-fg-muted hover:text-fg hover:bg-white/5"
            >
              <PlusIcon />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
          {FONT_PRESETS.map((p) => {
            const isActive = font === p.value
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setFont(p.value)}
                className={[
                  'text-left rounded-lg border-2 p-3 transition-colors',
                  isActive ? 'border-accent' : 'border-border hover:border-fg-muted',
                ].join(' ')}
              >
                <div className="text-lg text-fg mb-2 truncate" style={{ fontFamily: p.value }}>Aa Bb 123</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-fg truncate">{p.label}</span>
                  {isActive && (
                    <span className="shrink-0 text-xs font-medium text-accent px-1.5 py-0.5 rounded bg-accent/10">Active</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </Section>
  )
}
