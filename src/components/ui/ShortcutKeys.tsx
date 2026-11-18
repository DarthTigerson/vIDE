// The four Mac modifier glyphs Monaco's keybinding labels use, in the order
// they're conventionally shown (Control, Option, Shift, Command).
const MODIFIER_GLYPHS = ['⌃', '⌥', '⇧', '⌘']

// Monaco's own labels have no delimiter between a leading modifier glyph and
// the key that follows - the literal string is "⌥⌘F" or "⇧Enter", not
// "⌥ ⌘ F" or "⇧ Enter". Peeling off each leading modifier glyph as its own
// segment (and leaving the remaining key name - which may be multiple
// characters, e.g. "Backspace" - untouched as the final segment) lets a flex
// gap space out the *symbols* without also prying apart a multi-letter key
// name into individual spaced-out characters, which is what applying
// letter-spacing to the whole string did.
function splitIntoSegments(chord: string): string[] {
  const segments: string[] = []
  let rest = chord
  while (rest.length > 0 && MODIFIER_GLYPHS.includes(rest[0])) {
    segments.push(rest[0])
    rest = rest.slice(1)
  }
  if (rest) segments.push(rest)
  return segments
}

// Renders a keyboard shortcut string as individual bordered key chips
// instead of bare text - matches ShortcutsOverlay's <kbd> styling. Splits on
// whitespace first, so a multi-chord shortcut like "⌘K ⌘S" renders as one
// chip per chord; within each chip, splitIntoSegments spaces out the
// modifier glyphs from the key name.
export function ShortcutKeys({ shortcut }: { shortcut: string }) {
  return (
    <span className="flex items-center gap-1 shrink-0">
      {shortcut.split(' ').map((chord, i) => (
        <kbd
          key={i}
          className="flex items-center gap-0.5 min-w-[22px] px-1.5 py-0.5 text-xs text-center font-medium text-fg-subtle bg-panel border border-border rounded-sm"
        >
          {splitIntoSegments(chord).map((segment, j) => (
            <span key={j}>{segment}</span>
          ))}
        </kbd>
      ))}
    </span>
  )
}
