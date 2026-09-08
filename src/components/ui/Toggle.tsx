export function Toggle({ label, description, checked, onChange, disabled, className }: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <label
      className={[
        'flex items-center justify-between gap-4 -mx-2 px-2 py-1 rounded-lg transition-colors',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-white/5',
      ].join(' ')}
    >
      <div className={className}>
        <div className="text-sm text-fg">{label}</div>
        <div className="text-xs text-fg-muted mt-0.5">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative shrink-0 w-9 h-5 rounded-full border transition-colors',
          disabled ? 'cursor-not-allowed' : '',
          checked ? 'bg-accent border-accent' : 'bg-fg-subtle border-fg-subtle',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow ring-1 ring-black/10 transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </label>
  )
}
