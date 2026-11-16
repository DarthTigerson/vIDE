import { useLayoutEffect } from 'react'

// Palettes and modals take keyboard focus for their own input. When one
// closed, that input was removed and focus fell to <body>, so the terminal or
// editor the user was typing in needed a click before typing worked again.
// An overlay that calls this hands focus back to whatever had it before it
// opened, once it closes, whether by running a command or cancelling.
//
// Focus is left alone when:
// - the command moved it somewhere on purpose (a new terminal, a revealed
//   line in the editor): anything but <body> means someone else took it;
// - another overlay opened as this one closed (a palette command that opens
//   a confirm): that overlay inherits the target and restores it itself.

let openCount = 0
let handOff: HTMLElement | null = null

function focusable(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && el !== document.body
}

export function useRestoreFocus(): void {
  // Layout effect: runs before the overlay's own autofocus effect, so the
  // element captured is still the one the user was in.
  useLayoutEffect(() => {
    // A target handed off this frame wins over the current focus: it is
    // either an overlay that just closed (its replacement inherits) or this
    // same overlay remounting under StrictMode, after its input took focus.
    const active = document.activeElement
    const target = handOff ?? (focusable(active) ? active : null)
    handOff = null
    openCount++
    return () => {
      openCount--
      // Unmount cleanups run before a replacement overlay's mount effect in
      // the same commit, so it can pick this target up.
      handOff = target
      requestAnimationFrame(() => {
        if (handOff === target) handOff = null
        if (openCount > 0) return
        if (focusable(document.activeElement)) return
        if (target?.isConnected) target.focus()
      })
    }
  }, [])
}
