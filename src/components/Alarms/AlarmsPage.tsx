import { useEffect, useRef, useState } from 'react'
import { useAlarmStore } from '@/stores/alarmStore'
import { TimePicker } from './TimePicker'
import {
  formatAlarmTime,
  onceLabel,
  repeatLabel,
  type Alarm,
} from '@/lib/alarmSchedule'

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
// Day buttons run Monday → Sunday; values stay JS getDay() numbers (0 = Sunday).
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const WEEKDAYS = [1, 2, 3, 4, 5]

// Same uppercase label as the settings pages' Section headings.
function SectionLabel({ children }: { children: string }) {
  return <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">{children}</h2>
}

// The Alarms tab (VIDE-141), opened from the footer clock or "View: Alarms".
// Header like the settings pages; the alarms sit in one bordered list and
// the new-alarm form in a dashed box, as in the agreed mockup.
export function AlarmsPage() {
  const alarms = useAlarmStore((s) => s.alarms)
  const ringing = useAlarmStore((s) => s.ringing)

  // Re-render periodically so "Once · today" and "Snoozed until" stay true.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="h-full overflow-auto p-6 bg-panel">
      <h1 className="text-base font-semibold text-fg mb-1">Alarms</h1>
      <p className="text-sm text-fg-muted mb-6">
        Silent reminders. When one goes off, the footer flashes and a popup lets you snooze it for 9 minutes or stop it. No sound.
      </p>

      <div className="flex flex-col gap-8 max-w-[48rem]">
        <section>
          <SectionLabel>Your alarms</SectionLabel>
          {alarms.length === 0 ? (
            <p className="text-sm text-fg-subtle">No alarms yet. Add one below.</p>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
              {alarms.map((alarm) => <AlarmRow key={alarm.id} alarm={alarm} ringing={ringing?.alarmId === alarm.id} now={now} />)}
            </div>
          )}
        </section>

        <section>
          <SectionLabel>New alarm</SectionLabel>
          <div className="rounded-lg border border-dashed border-border p-4">
            <NewAlarmForm />
          </div>
        </section>
      </div>
    </div>
  )
}

function AlarmRow({ alarm, ringing, now }: { alarm: Alarm; ringing: boolean; now: number }) {
  const setEnabled = useAlarmStore((s) => s.setEnabled)
  const removeAlarm = useAlarmStore((s) => s.removeAlarm)
  const [time, period] = splitTime(formatAlarmTime(alarm.hour, alarm.minute))

  const status = ringing ? (
    <span className="text-accent">Ringing now</span>
  ) : alarm.enabled && alarm.snoozedUntil !== null && alarm.snoozedUntil > now ? (
    <span className="text-accent">
      Snoozed until {new Date(alarm.snoozedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
    </span>
  ) : (
    <span>{alarm.repeat ? repeatLabel(alarm.days) : onceLabel(alarm.date ?? '', new Date(now))}</span>
  )

  return (
    <div
      data-testid="alarm-row"
      className={['flex items-center gap-5 px-4 py-2.5', ringing ? 'bg-accent/10' : 'bg-sidebar'].join(' ')}
    >
      {/* Fixed width, right-aligned: "1:00" and "12:00" line up on the colon
          and every name starts at the same place. Fits "12:00 PM". */}
      <div className={['flex w-28 shrink-0 items-baseline justify-end text-2xl font-light tabular-nums', alarm.enabled ? 'text-fg' : 'text-fg-subtle'].join(' ')}>
        {time}
        {period && <span className="ml-1 text-sm font-medium text-fg-muted">{period}</span>}
      </div>
      <div className="min-w-0 flex-1 text-xs text-fg-muted">
        <AlarmName alarm={alarm} />
        {status}
      </div>
      <button
        type="button"
        role="switch"
        aria-label={`${alarm.name} on`}
        aria-checked={alarm.enabled}
        onClick={() => setEnabled(alarm.id, !alarm.enabled)}
        className={[
          'relative shrink-0 w-9 h-5 rounded-full border transition-colors',
          alarm.enabled ? 'bg-accent border-accent/80' : 'bg-white/10 border-white/15',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm ring-1 ring-black/10 transition-transform',
            alarm.enabled ? 'translate-x-4' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
      <button
        type="button"
        aria-label={`Delete ${alarm.name}`}
        title="Delete"
        onClick={() => removeAlarm(alarm.id)}
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded-sm text-fg-subtle hover:text-fg hover:bg-white/10"
      >
        ×
      </button>
    </div>
  )
}

// Click the name to rename it in place: Enter or clicking away saves,
// Escape cancels, and a blank name falls back to the old one.
function AlarmName({ alarm }: { alarm: Alarm }) {
  const renameAlarm = useAlarmStore((s) => s.renameAlarm)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(alarm.name)
  // Set once Enter/Escape has decided, so the blur that follows when the
  // input unmounts can't save a cancelled edit.
  const done = useRef(false)
  const color = alarm.enabled ? 'text-fg' : 'text-fg-subtle'

  if (!editing) {
    return (
      <button
        type="button"
        title="Rename"
        onClick={() => {
          setDraft(alarm.name)
          done.current = false
          setEditing(true)
        }}
        className={['block max-w-full truncate rounded-sm -mx-1 px-1 text-left text-sm font-medium hover:bg-white/5 cursor-text', color].join(' ')}
      >
        {alarm.name}
      </button>
    )
  }

  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    if (save) renameAlarm(alarm.id, draft)
    setEditing(false)
  }

  return (
    <input
      autoFocus
      aria-label="Alarm name"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true)
        else if (e.key === 'Escape') finish(false)
      }}
      className={['w-full -mx-1 px-1 rounded-sm bg-bg border border-accent/60 text-sm font-medium focus:outline-hidden', color].join(' ')}
    />
  )
}

function NewAlarmForm() {
  const addAlarm = useAlarmStore((s) => s.addAlarm)
  const [name, setName] = useState('')
  const [hour, setHour] = useState(9)
  const [minute, setMinute] = useState(0)
  const [repeat, setRepeat] = useState(false)
  const [days, setDays] = useState<number[]>(WEEKDAYS)

  const canAdd = name.trim().length > 0 && (!repeat || days.length > 0)

  const submit = () => {
    if (!canAdd) return
    addAlarm({ name, hour, minute, repeat, days })
    setName('')
  }

  // 30px, the height of the time field beside it.
  const inputClass = 'h-[1.875rem] px-2 text-sm text-fg bg-bg border border-border rounded-lg focus:outline-hidden focus:border-accent/60'

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1 flex-1 min-w-[12rem]">
          <label htmlFor="alarm-name" className="text-xs text-fg-muted">Name</label>
          <input id="alarm-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Stand-up, Lunch" className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="alarm-time" className="text-xs text-fg-muted">Time</label>
          <TimePicker
            id="alarm-time"
            hour={hour}
            minute={minute}
            onChange={(h, m) => {
              setHour(h)
              setMinute(m)
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="How often" className="flex rounded-full border border-border bg-bg overflow-hidden">
          {[{ value: false, label: 'Once' }, { value: true, label: 'Repeat' }].map((opt) => (
            <button
              key={opt.label}
              type="button"
              role="radio"
              aria-checked={repeat === opt.value}
              onClick={() => setRepeat(opt.value)}
              className={[
                'h-7 px-3 text-xs transition-colors',
                repeat === opt.value ? 'bg-accent text-on-accent font-semibold' : 'text-fg-muted hover:text-fg',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {repeat && (
          <>
            <div className="flex gap-1">
              {WEEK_ORDER.map((day) => {
                const letter = DAY_LETTERS[day]
                const on = days.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    aria-label={DAY_NAMES[day]}
                    aria-pressed={on}
                    onClick={() => setDays((prev) => (on ? prev.filter((d) => d !== day) : [...prev, day]))}
                    className={[
                      'w-7 h-7 rounded-full border text-xs transition-colors',
                      on ? 'bg-accent border-accent text-on-accent font-semibold' : 'bg-bg border-border text-fg-muted hover:text-fg',
                    ].join(' ')}
                  >
                    {letter}
                  </button>
                )
              })}
            </div>
          </>
        )}
        {/* Disabled until the alarm has a name (and, for Repeat, a day). */}
        <button
          type="submit"
          disabled={!canAdd}
          className="ml-auto h-8 px-4 rounded-full bg-accent text-on-accent text-xs font-semibold transition-opacity disabled:opacity-40 disabled:cursor-default"
        >
          Add alarm
        </button>
      </div>
    </form>
  )
}

// "9:30 AM" -> ["9:30", "AM"]; a 24-hour locale has no period.
function splitTime(formatted: string): [string, string] {
  const match = formatted.match(/^(.*?)\s*([AaPp]\.?[Mm]\.?)$/)
  return match ? [match[1], match[2]] : [formatted, '']
}
