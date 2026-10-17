import { useAlarmStore } from '@/stores/alarmStore'
import { formatAlarmTime } from '@/lib/alarmSchedule'
import { AlarmIcon } from './AlarmIcon'
import { useCoverNativeViews } from '@/lib/nativeViewCover'
import { footerPopupShadow } from '@/components/ui/footerPopup'

// The ringing alarm's popup (VIDE-141), styled like NotificationPeek and
// anchored above the clock. Stays up until Snooze (9 minutes) or Stop.
export function AlarmPopup() {
  const ringing = useAlarmStore((s) => s.ringing)
  const alarm = useAlarmStore((s) => s.alarms.find((a) => a.id === s.ringing?.alarmId))
  const snooze = useAlarmStore((s) => s.snooze)
  const stop = useAlarmStore((s) => s.stop)
  useCoverNativeViews(!!ringing && !!alarm)
  if (!ringing || !alarm) return null

  return (
    <div
      role="alertdialog"
      aria-label={`Alarm: ${alarm.name}`}
      data-testid="alarm-popup"
      className={`alarm-popup absolute bottom-full -right-3 mb-[3px] w-[26rem] max-w-[92vw] z-40 overflow-hidden rounded-t border border-b-0 border-border bg-popover ${footerPopupShadow}`}
    >
      <div className="flex items-center gap-2.5 pl-3 pr-2 py-2 text-xs">
        <span className="alarm-popup-icon shrink-0 flex text-accent [&_svg]:h-3.5 [&_svg]:w-3.5">
          <AlarmIcon />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-fg">{alarm.name}</div>
          <div className="text-fg-muted tabular-nums">{formatAlarmTime(alarm.hour, alarm.minute)}</div>
        </div>
        <button
          type="button"
          onClick={snooze}
          title="Snooze for 9 minutes"
          className="shrink-0 h-6 px-2.5 rounded-full border border-border bg-bg text-fg hover:border-fg-subtle transition-colors"
        >
          Snooze
        </button>
        <button
          type="button"
          onClick={stop}
          className="shrink-0 h-6 px-2.5 rounded-full border border-accent bg-accent text-on-accent font-semibold"
        >
          Stop
        </button>
      </div>
    </div>
  )
}
