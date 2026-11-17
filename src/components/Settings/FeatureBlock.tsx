import type { ReactNode } from 'react'
import { Switch } from '@/components/ui/Toggle'

// One feature on a settings page: title, one-line description and optional
// main switch on top, its controls underneath, and an optional live picture
// of what it does on the right (VIDE-145). The preview drops below the
// controls when the pane is too narrow for both (flex-wrap on basis widths,
// no container-query plugin). While the switch is off the controls stay in
// place but dim and disable, so flipping it never makes the page jump; the
// switch itself sits outside the disabled fieldset so it can be turned back on.
export function FeatureBlock({ title, description, toggle, preview, dimWhenOff = true, children }: {
  title: string
  description?: ReactNode
  // label names the switch for screen readers and tests when it differs
  // from the block title (e.g. block "Notes", switch "Enable Notes").
  toggle?: { checked: boolean; onChange: (value: boolean) => void; label?: string; disabled?: boolean }
  preview?: ReactNode
  dimWhenOff?: boolean
  children?: ReactNode
}) {
  const dimmed = !!toggle && !toggle.checked && dimWhenOff
  return (
    <section
      aria-label={title}
      className="flex flex-wrap items-start gap-x-8 gap-y-4 border-t border-border py-6 first:border-t-0 first:pt-2"
    >
      <div className="min-w-0 flex-1 basis-[22rem]">
        <div className="flex max-w-[460px] items-start justify-between gap-4">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {toggle && <Switch label={toggle.label ?? title} checked={toggle.checked} onChange={toggle.onChange} disabled={toggle.disabled} />}
        </div>
        {description && <p className="mt-0.5 max-w-[52ch] text-xs leading-relaxed text-fg-muted">{description}</p>}
        {children && (
          <fieldset
            disabled={dimmed}
            className={['m-0 mt-2 min-w-0 border-0 p-0 transition-opacity', dimmed ? 'opacity-50' : ''].join(' ')}
          >
            {children}
          </fieldset>
        )}
      </div>
      {preview && (
        <div data-preview="" className="w-[300px] max-w-full shrink-0">
          {preview}
        </div>
      )}
    </section>
  )
}

// Label (and optional muted description) on the left, control right beside
// it, capped so the control never drifts to the far edge of a wide pane.
// `sub` indents a dependent option; `stacked` puts the control under the
// label (text fields).
export function SettingRow({ label, description, htmlFor, sub, stacked, children }: {
  label: string
  description?: string
  htmlFor?: string
  sub?: boolean
  stacked?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={[
        'max-w-[460px] py-1.5',
        sub ? 'pl-4' : '',
        stacked ? 'flex flex-col gap-1.5' : 'flex items-center justify-between gap-4',
      ].join(' ')}
    >
      <div className="min-w-0">
        <label htmlFor={htmlFor} className={['text-sm', sub ? 'text-fg-muted' : 'text-fg'].join(' ')}>
          {label}
        </label>
        {description && <div className="mt-0.5 text-xs text-fg-muted">{description}</div>}
      </div>
      <div className={stacked ? 'min-w-0' : 'shrink-0'}>{children}</div>
    </div>
  )
}

export function NumberInput({ id, label, value, min, max, unit, onChange }: {
  id: string
  label: string
  value: number
  min: number
  max: number
  unit: string
  onChange: (value: number) => void
}) {
  return (
    <span className="flex items-center gap-2">
      <input
        id={id}
        aria-label={label}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value, 10) || min)))}
        className="w-16 rounded-lg border border-border bg-bg px-2 py-1 text-sm text-fg focus:border-accent/60 focus:outline-hidden"
      />
      <span className="text-sm text-fg-muted">{unit}</span>
    </span>
  )
}
