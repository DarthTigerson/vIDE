import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatAlarmTime, uses12HourClock } from '@/lib/alarmSchedule'

const pad = (n: number) => String(n).padStart(2, '0')
const MINUTES = Array.from({ length: 60 }, (_, m) => m)
const HOURS_24 = Array.from({ length: 24 }, (_, h) => h)
// 12-hour clocks list 12 first: 12 AM is midnight, 12 PM is noon.
const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

// The alarm time field (VIDE-141, mockup "T1"): one field whose panel has
// hour and minute columns side by side — plus an AM/PM column when the
// system clock is 12-hour, so the picker reads the same way as the footer
// clock and the alarm list. The native time input's picker can't be themed,
// and two separate dropdowns could both be open at once. Picking in any
// column keeps the panel open so the time can be adjusted freely; an
// outside click or Escape closes it. `hour` is always 0–23.
export function TimePicker({ id, hour, minute, onChange, hour12 = uses12HourClock() }: {
  id?: string
  hour: number
  minute: number
  onChange: (hour: number, minute: number) => void
  hour12?: boolean
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const columnsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Open on the current time, centred in each column, not at the top.
  useLayoutEffect(() => {
    if (!open) return
    columnsRef.current?.querySelectorAll<HTMLElement>('[role="listbox"]').forEach((column) => {
      const selected = column.querySelector<HTMLElement>('[aria-selected="true"]')
      if (selected) column.scrollTop = selected.offsetTop - column.clientHeight / 2 + selected.clientHeight / 2
    })
  }, [open])

  const isPm = hour >= 12
  const to24 = (h12: number, pm: boolean) => (h12 % 12) + (pm ? 12 : 0)

  const option = (key: string | number, label: string, selected: boolean, onPick: () => void) => (
    <button
      key={key}
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className={[
        'h-[26px] shrink-0 rounded-sm text-sm tabular-nums transition-colors',
        selected ? 'bg-accent text-on-accent font-semibold' : 'text-fg-muted hover:bg-white/5 hover:text-fg',
      ].join(' ')}
    >
      {label}
    </button>
  )

  const heading = (label: string) => (
    <div className="pb-1 text-center text-[0.625rem] font-semibold uppercase tracking-wider text-fg-subtle">{label}</div>
  )
  const columnClass = 'relative flex h-48 flex-col gap-0.5 overflow-y-auto pr-0.5'

  return (
    <div ref={wrapperRef} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={[
          'h-[1.875rem] min-w-[5.5rem] flex items-center justify-between gap-2 rounded-lg border bg-bg pl-2.5 pr-2 text-sm text-fg tabular-nums transition-colors',
          open ? 'border-accent/60' : 'border-border hover:border-accent/60',
        ].join(' ')}
      >
        <span>{hour12 ? formatAlarmTime(hour, minute) : `${pad(hour)}:${pad(minute)}`}</span>
        <ClockIcon />
      </button>

      {open && (
        <div
          data-testid="time-picker-panel"
          className={[
            'absolute right-0 top-full mt-1 z-50 rounded-sm border border-border bg-popover p-1.5 shadow-2xl shadow-black/50',
            hour12 ? 'w-[12rem]' : 'w-[8.5rem]',
          ].join(' ')}
        >
          <div ref={columnsRef} className={['grid gap-1', hour12 ? 'grid-cols-3' : 'grid-cols-2'].join(' ')}>
            {heading('Hour')}
            {heading('Min')}
            {hour12 && heading('AM/PM')}
            <div role="listbox" aria-label="Hour" className={columnClass}>
              {hour12
                ? HOURS_12.map((h) => option(h, String(h), to24(h, isPm) === hour, () => onChange(to24(h, isPm), minute)))
                : HOURS_24.map((h) => option(h, pad(h), h === hour, () => onChange(h, minute)))}
            </div>
            <div role="listbox" aria-label="Minute" className={columnClass}>
              {MINUTES.map((m) => option(m, pad(m), m === minute, () => onChange(hour, m)))}
            </div>
            {hour12 && (
              <div role="listbox" aria-label="AM/PM" className="flex flex-col gap-0.5">
                {option('am', 'AM', !isPm, () => onChange(hour % 12, minute))}
                {option('pm', 'PM', isPm, () => onChange((hour % 12) + 12, minute))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ClockIcon() {
  return (
    <svg className="shrink-0 text-fg-muted" width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
