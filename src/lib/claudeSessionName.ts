// Claude Code sets the terminal title (OSC 0/2) to a short task summary,
// prefixed with a status glyph — "✳" when idle, a braille spinner frame
// while busy. The glyph flickers every frame, so strip anything before the
// first letter/digit to get a stable label.
export function cleanSessionTitle(raw: string): string {
  return raw.replace(/^[^\p{L}\p{N}]+/u, '').trim()
}

// Custom name (right-click → Rename…) wins, then the live terminal title,
// then a positional fallback for a session that hasn't set a title yet.
export function sessionDisplayName(inst: { name?: string }, title: string | undefined, index: number): string {
  return inst.name || title || `Session ${index + 1}`
}

// Terminal sessions have no live title; they're numbered among themselves
// ("Terminal", "Terminal 2", …) and that stands in as their auto title.
export function terminalSessionTitle(ordinal: number): string {
  return ordinal === 0 ? 'Terminal' : `Terminal ${ordinal + 1}`
}
