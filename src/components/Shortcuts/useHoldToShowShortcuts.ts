import { useEffect, useRef } from 'react'
import { useSearchStore } from '@/stores/searchStore'

const TAP_GAP_MS = 300
const TAPS_REQUIRED = 3

export function useHoldToShowShortcuts() {
  const lastReleaseRef = useRef<number>(0)
  const tapCountRef = useRef<number>(0)

  useEffect(() => {
    function closeIfOpen() {
      if (useSearchStore.getState().shortcutsOverlayOpen) {
        useSearchStore.getState().closeShortcutsOverlay()
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      const isModifier = e.key === 'Meta' || e.key === 'Control'

      if (isModifier) {
        const now = Date.now()
        tapCountRef.current =
          lastReleaseRef.current > 0 && now - lastReleaseRef.current <= TAP_GAP_MS ? tapCountRef.current + 1 : 1
        lastReleaseRef.current = 0

        if (tapCountRef.current >= TAPS_REQUIRED) {
          tapCountRef.current = 0
          const { commandPaletteOpen, actionPaletteOpen, shortcutsOverlayOpen, openShortcutsOverlay, closeShortcutsOverlay } =
            useSearchStore.getState()
          if (shortcutsOverlayOpen) {
            closeShortcutsOverlay()
          } else if (!commandPaletteOpen && !actionPaletteOpen) {
            openShortcutsOverlay()
          }
        }
        return
      }

      // Any non-modifier key cancels the tap sequence and closes the overlay
      tapCountRef.current = 0
      lastReleaseRef.current = 0
      closeIfOpen()
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Meta' || e.key === 'Control') {
        lastReleaseRef.current = Date.now()
      }
    }

    function onBlur() {
      tapCountRef.current = 0
      lastReleaseRef.current = 0
      closeIfOpen()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
}
