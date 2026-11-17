// Daily theme shuffle (Settings › Display › Theme). Pure picking logic; the
// store that applies it is src/stores/themeShuffleStore.ts.
//
// The pick is a function of the local date alone, so every machine synced
// through vIDE Sync lands on the same theme on the same day instead of each
// shuffling on its own and fighting over the synced 'vide:theme' key.
//
// Days are grouped into cycles of `families.length`; each cycle walks a seeded
// permutation of every family, so all of them come round before any repeats.
// Where a cycle would open on the family the previous one closed on, its
// first two entries swap — so no two consecutive days ever share a family.

// Days since 1970-01-01 in local time (the user's midnight, not UTC's).
export function localDayIndex(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
}

// mulberry32: tiny seeded PRNG, deterministic across machines and runs.
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededPermutation<T>(items: readonly T[], seed: number): T[] {
  const out = [...items]
  const rand = rng(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function cycleOrder<T>(items: readonly T[], cycle: number): T[] {
  const order = seededPermutation(items, cycle)
  // Only indices 0 and 1 ever move, so the previous cycle's last entry is the
  // same whether or not that cycle was adjusted itself (needs 3+ items).
  if (items.length > 2 && order[0] === seededPermutation(items, cycle - 1)[items.length - 1]) {
    ;[order[0], order[1]] = [order[1], order[0]]
  }
  return order
}

export function shuffleFamilyFor<T>(dayIndex: number, families: readonly T[]): T {
  if (families.length === 0) throw new Error('no families to shuffle')
  const n = families.length
  const cycle = Math.floor(dayIndex / n)
  return cycleOrder(families, cycle)[dayIndex - cycle * n]
}
