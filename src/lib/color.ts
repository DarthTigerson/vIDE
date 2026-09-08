// Appends an alpha channel to a 6-digit hex color, e.g. hexWithAlpha('#1e1e1e', 0.25)
// -> '#1e1e1e40'. Used to derive glass-panel-style variants of Monaco/xterm
// theme backgrounds, which are hardcoded hex colors independent of the
// --color-panel/--color-bg CSS custom properties the rest of the UI uses.
export function hexWithAlpha(hex: string, alpha: number): string {
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
  return hex + byte.toString(16).padStart(2, '0')
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const byte = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')
  return `#${byte(r)}${byte(g)}${byte(b)}`
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const { r, g, b } = hexToRgb(hex)
  const rN = r / 255, gN = g / 255, bN = b / 255
  const max = Math.max(rN, gN, bN)
  const min = Math.min(rN, gN, bN)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    if (max === rN) h = 60 * (((gN - bN) / delta) % 6)
    else if (max === gN) h = 60 * ((bN - rN) / delta + 2)
    else h = 60 * ((rN - gN) / delta + 4)
  }
  if (h < 0) h += 360

  const s = max === 0 ? 0 : delta / max
  const v = max

  return { h: Math.round(h), s, v }
}

export function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c

  let rN = 0, gN = 0, bN = 0
  if (h < 60)       { rN = c; gN = x; bN = 0 }
  else if (h < 120) { rN = x; gN = c; bN = 0 }
  else if (h < 180) { rN = 0; gN = c; bN = x }
  else if (h < 240) { rN = 0; gN = x; bN = c }
  else if (h < 300) { rN = x; gN = 0; bN = c }
  else              { rN = c; gN = 0; bN = x }

  return rgbToHex((rN + m) * 255, (gN + m) * 255, (bN + m) * 255)
}

export function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}
