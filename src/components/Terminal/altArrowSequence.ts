// xterm.js 5.x rewrote a bare Alt+Arrow (no other modifier) into the
// sequence shells bind to word movement: on macOS Option+Left/Right sent
// ESC b / ESC f (readline's and zsh's backward-/forward-word), elsewhere
// Alt+Arrow sent the Ctrl+Arrow sequence. xterm.js 6 dropped that hack
// (xtermjs/xterm.js#5346) and now sends the plain xterm Alt+Arrow sequence
// (ESC [1;3D etc.), which neither zsh nor bash binds by default, so
// Option+Left/Right in a terminal or Claude panel would stop jumping words.
// The custom key handlers use this to keep 5.x's behaviour: it returns the
// bytes 5.x sent for the key, or undefined when xterm's default is the same
// or the key isn't an Alt-only arrow.
export function legacyAltArrowSequence(
  event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'shiftKey' | 'metaKey'>,
  isMac: boolean,
): string | undefined {
  if (!event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) return undefined
  switch (event.key) {
    case 'ArrowLeft':
      return isMac ? '\x1bb' : '\x1b[1;5D'
    case 'ArrowRight':
      return isMac ? '\x1bf' : '\x1b[1;5C'
    // 5.x only remapped Up/Down off macOS; on macOS they already sent the
    // plain Alt sequence xterm.js 6 still sends.
    case 'ArrowUp':
      return isMac ? undefined : '\x1b[1;5A'
    case 'ArrowDown':
      return isMac ? undefined : '\x1b[1;5B'
    default:
      return undefined
  }
}
