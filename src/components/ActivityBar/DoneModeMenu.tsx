import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { useCoverNativeViews } from '@/lib/nativeViewCover'
import { useEditorStore } from '@/stores/editorStore'
import { DONE_SOUND_OPTIONS, useDoneFeedbackStore, type DoneMode } from '@/stores/doneFeedbackStore'
import { SOUND_SETTINGS_TAB_PATH } from '@/components/Settings/paths'
import { voiceById } from '../../../electron/tts/catalog'

const GAP_PX = 4

// Same tab and row look as the "+" NewSessionMenu.
const TAB_CLASS = 'flex h-6 flex-1 items-center justify-center rounded-xs text-[0.6875rem] transition-colors'
const ROW_CLASS = 'flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg'

const MODES: { mode: DoneMode; label: string }[] = [
  { mode: 'off', label: 'Off' },
  { mode: 'sound', label: 'Sound' },
  { mode: 'speak', label: 'Speak' },
]

// Opened by the activity bar's speaker button: switch what happens when
// Claude or Rocky finishes, without going to Settings › Sound & Voice.
export function DoneModeMenu({ anchor, side, onClose }: {
  anchor: DOMRect
  side: 'left' | 'right'
  onClose: () => void
}) {
  useCoverNativeViews()
  const menuRef = useRef<HTMLDivElement>(null)
  const mode = useDoneFeedbackStore((s) => s.mode)
  const setMode = useDoneFeedbackStore((s) => s.setMode)
  const soundId = useDoneFeedbackStore((s) => s.soundId)
  const soundLabel = DONE_SOUND_OPTIONS.find((s) => s.id === soundId)?.label ?? ''
  const voiceName = voiceById(useDoneFeedbackStore((s) => s.voiceId))?.name

  useEffect(() => {
    const close = () => onClose()
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  useLayoutEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const x = side === 'right' ? anchor.left - rect.width - GAP_PX : anchor.right + GAP_PX
    const clamped = clampToViewport(x, anchor.top, rect.width, rect.height)
    menuRef.current.style.left = `${clamped.x}px`
    menuRef.current.style.top = `${clamped.y}px`
  }, [anchor, side])

  const detail =
    mode === 'off' ? 'Nothing plays when done.'
      : mode === 'sound' ? `Plays ${soundLabel} when done.`
        : `Speaks${voiceName ? ` with ${voiceName}` : ''} when done.`

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="When done"
      className="fixed z-[200] w-52 rounded-sm border border-border bg-sidebar p-1 shadow-2xl shadow-black/50"
      style={{ left: anchor.left, top: anchor.top }}
      onClick={(e) => e.stopPropagation()}
    >
      <div role="group" aria-label="When done" className="flex gap-0.5 rounded-sm bg-black/20 p-0.5">
        {MODES.map(({ mode: value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className={[TAB_CLASS, mode === value ? 'bg-white/10 text-fg' : 'text-fg-muted hover:text-fg'].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="px-2 pb-1 pt-1.5 text-[0.6875rem] text-fg-subtle">{detail}</p>
      <div className="my-1 h-px bg-border" />
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          useEditorStore.getState().openTab({ path: SOUND_SETTINGS_TAB_PATH, content: '', dirty: false })
          onClose()
        }}
        className={ROW_CLASS}
      >
        Sound &amp; Voice settings…
      </button>
    </div>,
    document.body
  )
}

export function DoneModeIcon({ mode }: { mode: DoneMode }) {
  return (
    <svg className="shrink-0" width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {mode === 'speak' ? (
        <>
          <path d="M4 5.5H20V15.5H9.5L5 19V15.5H4V5.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M8.5 10.5H8.51M12 10.5H12.01M15.5 10.5H15.51" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M4 9.5V14.5H8L13 18.5V5.5L8 9.5H4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          {mode === 'sound' ? (
            <>
              <path d="M16.5 8.5C17.5 9.5 18 10.7 18 12C18 13.3 17.5 14.5 16.5 15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M19 6C20.7 7.7 21.5 9.8 21.5 12C21.5 14.2 20.7 16.3 19 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </>
          ) : (
            <path d="M16.5 9.5L21 14M21 9.5L16.5 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          )}
        </>
      )}
    </svg>
  )
}
