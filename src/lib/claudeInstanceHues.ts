// The first-ever Claude instance always keeps the normal brand orange — no
// visual change for anyone who never adds a second session. Each additional
// instance gets the next color here (cycling if exhausted), assigned once
// at creation time and carried with the instance, so closing one session
// never re-colors the others.
export const CLAUDE_INSTANCE_HUES = [
  '#D97757', // brand orange — always the first instance
  '#5B9BD5',
  '#9B7ED9',
  '#6FBF73',
  '#E37CA8',
  '#4FC3C0',
  '#E0A84D',
]

export function hueForInstanceIndex(index: number): string {
  return CLAUDE_INSTANCE_HUES[index % CLAUDE_INSTANCE_HUES.length]
}

// The "Claude is working" gif pool (src/assets/claudeGifs.ts) has no color
// variety of its own — every gif's mascot body is this same brand orange,
// just with different small props (headphones, a lightbulb, ...). So a
// busy instance's gif can't be swapped for a differently-colored one; it
// has to be tinted. This is that orange's own HSL hue, in degrees.
const GIF_BASE_HUE_DEG = 15

function hexToHueDeg(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta === 0) return 0

  let h: number
  if (max === r) h = ((g - b) / delta) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4
  h *= 60
  return h < 0 ? h + 360 : h
}

// A CSS `hue-rotate(...)` degree that shifts the gif pool's fixed orange
// body color toward the given instance color, so a busy instance's
// animation reads as "that instance's color", not a random one from
// whichever gif pickClaudeGif() happened to choose.
export function gifHueRotationDeg(color: string): number {
  const rotation = hexToHueDeg(color) - GIF_BASE_HUE_DEG
  return rotation < 0 ? rotation + 360 : rotation
}
