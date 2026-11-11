// A machine at or below this much physical RAM is treated as "low RAM": vIDE
// scales back what it starts automatically at launch so it can't exhaust
// memory and freeze the machine (VIDE-163). 8 GB iMacs are the motivating
// case — Electron's multi-process footprint plus an auto-started autocomplete
// model plus a restored stack of Claude CLIs easily passes 8 GB, and macOS
// then compresses/swaps hard until the machine beachballs.
export const LOW_RAM_BYTES = 8 * 1024 ** 3

// Total RAM cached once at startup (main.tsx), so synchronous callers (e.g.
// the Chat spawn effect) can decide without racing an async fetch. Left null
// in tests / before the fetch lands, which reads as "not low RAM" so default
// behavior is unchanged.
let cachedTotalBytes: number | null = null

export function setCachedTotalBytes(bytes: number): void {
  cachedTotalBytes = bytes
}

// Pass a known total when you have one (e.g. the autocomplete lifecycle already
// fetched it); otherwise falls back to the startup-cached value.
export function isLowRam(totalBytes?: number): boolean {
  const t = totalBytes ?? cachedTotalBytes ?? 0
  return t > 0 && t <= LOW_RAM_BYTES
}
