import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { clampToViewport } from './clampToViewport'
import { useCoverNativeViews } from '@/lib/nativeViewCover'

export interface SelectOption {
  value: string
  label: string
  style?: React.CSSProperties
}

// Custom replacement for a native <select> — the browser's own dropdown
// list can't be themed, so this portals a menu styled like the app's other
// popups (TabContextMenu, the assistant switcher in App.tsx) instead.
export function Select({ id, value, onChange, options, disabled, compact, ariaLabel }: {
  id?: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  disabled?: boolean
  compact?: boolean
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  useCoverNativeViews(open && !disabled)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuStyle, setMenuStyle] = useState<{ left: number; top: number; width: number }>({ left: 0, top: 0, width: 0 })

  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const menuHeight = menuRef.current?.getBoundingClientRect().height ?? 0
    const clamped = clampToViewport(rect.left, rect.bottom + 4, rect.width, menuHeight)
    setMenuStyle({ left: clamped.x, top: clamped.y, width: rect.width })
  }, [open])

  const padding = compact ? 'px-2 py-1.5' : 'px-3 py-2.5 pr-9'
  const textSize = compact ? 'text-xs' : 'text-sm'

  return (
    <div className="relative">
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className={[
          'w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-bg text-left text-fg transition-colors focus:outline-hidden focus:border-accent/60',
          padding, textSize,
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <span className="truncate" style={selected?.style}>{selected?.label ?? ''}</span>
        {!compact && (
          <span className="pointer-events-none shrink-0 text-fg-subtle text-xs">▾</span>
        )}
      </button>

      {open && !disabled && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label={ariaLabel}
          className="fixed z-[200] max-h-64 overflow-y-auto rounded-sm border border-border bg-popover p-1 shadow-2xl shadow-black/50"
          style={{ left: menuStyle.left, top: menuStyle.top, width: menuStyle.width }}
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={[
                  'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors',
                  isSelected ? 'bg-accent/10 text-fg' : 'text-fg-muted hover:bg-white/5 hover:text-fg',
                ].join(' ')}
                style={opt.style}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <CheckIcon />}
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}

function CheckIcon() {
  return (
    <svg
      className="shrink-0 text-accent"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M5 12.5L10 17.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
