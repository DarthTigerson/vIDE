import { useEffect, useRef, useState } from 'react'
import { useFontSizeStore } from '@/stores/fontSizeStore'
import { useEditorStore } from '@/stores/editorStore'
import { useBottomTerminalStore } from '@/stores/bottomTerminalStore'
import { useLspSettingsStore } from '@/stores/lspSettingsStore'
import { useFooterPopoverStore } from '@/stores/footerPopoverStore'
import { DISPLAY_TAB_PATH } from '@/components/Settings/paths'
import { Switch } from '@/components/ui/Toggle'
import { footerPopupShadow } from '@/components/ui/footerPopup'
import { useCoverNativeViews } from '@/lib/nativeViewCover'
import { FooterTooltip } from './FooterTooltip'

// How long the chip stays highlighted after the size changes (the View
// menu's ⌘+ / ⌘− / ⌘0, or anywhere else).
const CHANGE_FLASH_MS = 1500

const stepButton = 'flex h-[22px] w-[26px] items-center justify-center text-fg transition-colors hover:bg-white/5 disabled:opacity-40'

// The footer's display chip (VIDE-140): a compact chip — screen icon + size —
// that opens the Display panel (mockup "Display chip popover", option 1): font
// size, the bottom terminal switch, and a link to Settings > Display. Size is
// also changed with the existing ⌘+ / ⌘− / ⌘0 menu shortcuts; the chip lights
// up briefly when it does so the new number is noticed.
export function FontSizeControl() {
  const fontSize = useFontSizeStore((s) => s.fontSize)
  const bottomTerminal = useBottomTerminalStore((s) => s.enabled)
  const hoverEnabled = useLspSettingsStore((s) => s.hoverEnabled)
  const completionEnabled = useLspSettingsStore((s) => s.completionEnabled)
  const setHoverEnabled = useLspSettingsStore((s) => s.setHoverEnabled)
  const setCompletionEnabled = useLspSettingsStore((s) => s.setCompletionEnabled)
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
            'rounded-t border border-b-0 border-border bg-popover',
            footerPopupShadow,
          ].join(' ')}
        >
          <span className="text-[0.6875rem] font-semibold tracking-[0.04em] text-fg-muted">DISPLAY</span>
          <div className="flex items-center justify-between">
            <span className="text-fg">Font size</span>
            <span className="flex items-center overflow-hidden rounded border border-border">
              <button type="button" aria-label="Smaller" className={stepButton} onClick={fonts.decrease}>−</button>
              <span data-testid="display-font-size" className="w-[30px] border-x border-border text-center leading-[22px] text-fg tabular-nums">{fontSize}</span>
              <button type="button" aria-label="Larger" className={stepButton} onClick={fonts.increase}>+</button>
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5">
            <span className="flex flex-col">
              <span className="text-fg">Bottom terminal</span>
              <span className="text-[0.6875rem] text-fg-muted">Lock terminals under the editor</span>
            </span>
            <Switch
              label="Bottom terminal"
              checked={bottomTerminal}
              onChange={(on) => useBottomTerminalStore.getState().setEnabled(on)}
            />
          </div>
          {/* Language-server features (Settings > Editor > Go to definition),
              global across every enabled language — muting them here never
              stops a server, it just stops asking it for these. */}
          <div className="flex flex-col gap-2.5 border-t border-border pt-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="flex flex-col">
                <span className="text-fg">Hover docs</span>
                <span className="text-[0.6875rem] text-fg-muted">Type info and docs on hover, from language servers</span>
              </span>
              <Switch label="Hover docs" checked={hoverEnabled} onChange={() => setHoverEnabled(!hoverEnabled)} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex flex-col">
                <span className="text-fg">Completion suggestions</span>
                <span className="text-[0.6875rem] text-fg-muted">Dropdown suggestions from language servers</span>
              </span>
              <Switch label="Completion suggestions" checked={completionEnabled} onChange={() => setCompletionEnabled(!completionEnabled)} />
            </div>
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

function ScreenIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="12" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <path d="M9 20h6M12 16v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
