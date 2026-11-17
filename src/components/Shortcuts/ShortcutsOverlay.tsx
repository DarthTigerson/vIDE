import { useSearchStore } from '@/stores/searchStore'
import { SHORTCUT_GROUPS } from './shortcuts'
import { useCoverNativeViews } from '@/lib/nativeViewCover'

export function ShortcutsOverlay() {
  useCoverNativeViews()
  const closeShortcutsOverlay = useSearchStore((s) => s.closeShortcutsOverlay)

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60"
      onClick={closeShortcutsOverlay}
    >
      <div
        className="w-[420px] max-h-[70vh] overflow-y-auto flex flex-col gap-5 bg-popover border border-border rounded-xl shadow-2xl shadow-black/60 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.category}>
            <div className="text-xs font-semibold uppercase tracking-wide text-fg-subtle mb-2">
              {group.category}
            </div>
            <div className="flex flex-col gap-1.5">
              {group.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-fg-muted">{item.label}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    {item.keys.map((key, i) => (
                      <kbd
                        key={i}
                        className="min-w-[22px] px-1.5 py-0.5 text-xs text-center font-medium text-fg bg-panel border border-border rounded-sm"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
