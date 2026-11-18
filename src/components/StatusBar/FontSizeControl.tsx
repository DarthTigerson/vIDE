import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useFontSizeStore } from '@/stores/fontSizeStore'
import { useEditorStore } from '@/stores/editorStore'
import { useBottomTerminalStore } from '@/stores/bottomTerminalStore'
import { useLspSettingsStore } from '@/stores/lspSettingsStore'
import { useThemeStore } from '@/stores/themeStore'
import { useFooterPopoverStore } from '@/stores/footerPopoverStore'
import { DISPLAY_TAB_PATH } from '@/components/Settings/paths'
import { Switch } from '@/components/ui/Toggle'
import { footerPopupShadow } from '@/components/ui/footerPopup'
import { useCoverNativeViews } from '@/lib/nativeViewCover'
import { FooterTooltip } from './FooterTooltip'

// How long the chip stays highlighted after the size changes (the View
// menu's ⌘+ / ⌘− / ⌘0, or anywhere else).
const CHANGE_FLASH_MS = 1500

// How long the mouse has to rest on a panel row before its description
// appears at the cursor. Long enough that sweeping across the panel shows
// nothing, like a native macOS tooltip.
const HINT_DELAY_MS = 700

type Appearance = 'light' | 'system' | 'dark'
const APPEARANCE_OPTIONS: { value: Appearance; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
]

const stepButton = 'flex h-[22px] w-[26px] items-center justify-center text-fg transition-colors hover:bg-white/5 disabled:opacity-40'

// The footer's display chip (VIDE-140): a compact chip — screen icon + size —
// that opens the Display panel: Light/System/Dark, font size, the bottom
// terminal lock, the language-server switches, and a link to Settings >
// Display. Rows carry no visible description; resting the mouse on one shows
// it at the cursor (HintRow). Size is also changed with the global
// ⌘⇧+ / ⌘⇧− / ⌘⇧0 menu shortcuts; the chip lights up briefly when it does so
// the new number is noticed.
export function FontSizeControl() {
  const fontSize = useFontSizeStore((s) => s.fontSize)
  const bottomTerminal = useBottomTerminalStore((s) => s.enabled)
  const hoverEnabled = useLspSettingsStore((s) => s.hoverEnabled)
  const completionEnabled = useLspSettingsStore((s) => s.completionEnabled)
  const setHoverEnabled = useLspSettingsStore((s) => s.setHoverEnabled)
  const setCompletionEnabled = useLspSettingsStore((s) => s.setCompletionEnabled)
  const theme = useThemeStore((s) => s.theme)
  const matchSystem = useThemeStore((s) => s.matchSystem)
  const appearance: Appearance = matchSystem ? 'system' : theme.endsWith('-dark') ? 'dark' : 'light'
  const setAppearance = (v: Appearance) => {
    const store = useThemeStore.getState()
    if (v === 'system') store.setMatchSystem(true)
    else store.setVariant(v === 'dark')
  }
  const [flashing, setFlashing] = useState(false)
  const open = useFooterPopoverStore((s) => s.openId === 'display')
  useCoverNativeViews(open)

  const prevSize = useRef(fontSize)
  useEffect(() => {
    if (prevSize.current === fontSize) return
    prevSize.current = fontSize
    setFlashing(true)
    const timer = setTimeout(() => setFlashing(false), CHANGE_FLASH_MS)
    return () => clearTimeout(timer)
  }, [fontSize])

  useEffect(() => {
    if (!open) return
    const close = () => useFooterPopoverStore.getState().close()
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  const fonts = useFontSizeStore.getState()
  const openSettings = () => {
    useEditorStore.getState().openTab({ path: DISPLAY_TAB_PATH, content: '', dirty: false })
    useFooterPopoverStore.getState().close()
  }

  return (
    <div className="relative">
      <FooterTooltip label="Display" hidden={open}>
        <button
          type="button"
          data-testid="font-size-chip"
          onClick={(e) => { e.stopPropagation(); useFooterPopoverStore.getState().toggle('display') }}
          aria-label={`Font size ${fontSize}, open Display`}
          aria-expanded={open}
          className={[
            'flex h-5 shrink-0 items-center gap-1 rounded-full border bg-bg px-2 text-xs tabular-nums transition-colors',
            flashing ? 'border-accent text-accent'
              : open ? 'border-fg-subtle text-fg'
                : 'border-border text-fg-muted hover:text-fg hover:border-fg-subtle',
          ].join(' ')}
        >
          <ScreenIcon />
          <span>{fontSize}</span>
        </button>
      </FooterTooltip>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={[
            'absolute bottom-full -right-3 z-50 mb-[3px] flex w-72 flex-col gap-2.5 p-3 text-xs',
            'rounded-t-sm border border-b-0 border-border bg-popover',
            footerPopupShadow,
          ].join(' ')}
        >
          <span className="text-[0.6875rem] font-semibold tracking-[0.04em] text-fg-muted">DISPLAY</span>
          <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 overflow-hidden rounded-sm border border-border">
            {APPEARANCE_OPTIONS.map((opt) => {
              const active = opt.value === appearance
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setAppearance(opt.value)}
                  className={[
                    'h-6 border-l border-border text-xs transition-colors first:border-l-0',
                    active ? 'bg-accent/15 font-semibold text-accent' : 'text-fg-muted hover:bg-white/5 hover:text-fg',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <HintRow hint={<>Change the size of all vIDE text.<br /><Kbd>⌘⇧+</Kbd> larger · <Kbd>⌘⇧−</Kbd> smaller · <Kbd>⌘⇧0</Kbd> reset</>}>
            <span className="text-fg">Font size</span>
            <span className="flex items-center overflow-hidden rounded-sm border border-border">
              <button type="button" aria-label="Smaller" className={stepButton} onClick={fonts.decrease}>−</button>
              <span data-testid="display-font-size" className="w-[30px] border-x border-border text-center leading-[22px] text-fg tabular-nums">{fontSize}</span>
              <button type="button" aria-label="Larger" className={stepButton} onClick={fonts.increase}>+</button>
            </span>
          </HintRow>
          <HintRow className="border-t border-border pt-2.5" hint="Keep terminals docked under the editor instead of beside it.">
            <span className="text-fg">Lock terminal to bottom</span>
            <Switch
              label="Lock terminal to bottom"
              checked={bottomTerminal}
              onChange={(on) => useBottomTerminalStore.getState().setEnabled(on)}
            />
          </HintRow>
          {/* Language-server features (Settings > Editor > Go to definition),
              global across every enabled language — muting them here never
              stops a server, it just stops asking it for these. */}
          <div className="flex flex-col gap-2.5 border-t border-border pt-2.5">
            <HintRow hint="Show type info and docs when hovering code. Comes from installed language servers.">
              <span className="text-fg">Hover docs</span>
              <Switch label="Hover docs" checked={hoverEnabled} onChange={() => setHoverEnabled(!hoverEnabled)} />
            </HintRow>
            <HintRow hint="Show a dropdown of suggestions while typing. Comes from installed language servers.">
              <span className="text-fg">Completion suggestions</span>
              <Switch label="Completion suggestions" checked={completionEnabled} onChange={() => setCompletionEnabled(!completionEnabled)} />
            </HintRow>
          </div>

          <div className="border-t border-border pt-2">
            <button type="button" className="text-xs text-accent hover:underline" onClick={openSettings}>
              Display settings…
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// A panel row whose description appears where the mouse rests, after
// HINT_DELAY_MS. Moving restarts the wait; once shown the hint stays put until
// the mouse leaves the row or clicks. It opens up and to the left of the
// cursor because the panel sits against the window's right edge. No hover
// tint on the row itself — the controls already show their own state.
function HintRow({ hint, className = '', children }: { hint: ReactNode; className?: string; children: ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  useEffect(() => clear, [])

  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (pos) return
    clear()
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    timer.current = setTimeout(() => setPos({ x, y }), HINT_DELAY_MS)
  }
  const hide = () => {
    clear()
    setPos(null)
  }

  return (
    <div
      className={`relative flex items-center justify-between gap-3 ${className}`}
      onMouseMove={onMouseMove}
      onMouseLeave={hide}
      onMouseDown={hide}
    >
      {children}
      {pos && (
        <span
          role="tooltip"
          className="pointer-events-none absolute z-10 w-max max-w-[210px] -translate-x-full -translate-y-full rounded-sm border border-border bg-popover px-2.5 py-1.5 text-[0.6875rem] leading-snug text-fg shadow-[0_4px_14px_rgba(0,0,0,0.18)]"
          style={{ left: pos.x + 4, top: pos.y - 10 }}
        >
          {hint}
        </span>
      )}
    </div>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-[3px] border border-b-2 border-border bg-bg px-1 text-[0.65rem] leading-[15px] text-fg">
      {children}
    </span>
  )
}

function ScreenIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="12" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <path d="M9 20h6M12 16v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
