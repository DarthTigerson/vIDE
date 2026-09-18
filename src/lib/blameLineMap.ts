import { diffLines } from 'diff'
import { normalizeForDiff } from './lineDiff'

export type LineOrigin = { kind: 'clean'; headLine: number } | { kind: 'uncommitted' }

// Maps each live-buffer line to its HEAD blob line, since uncommitted edits shift them apart; a line with no HEAD counterpart is 'uncommitted'.
export function buildLiveToHeadLineMap(headContent: string, liveContent: string): Map<number, LineOrigin> {
  const parts = diffLines(normalizeForDiff(headContent), normalizeForDiff(liveContent))
  const map = new Map<number, LineOrigin>()
  let head = 0
  let live = 0

  for (const part of parts) {
    const count = part.count ?? 0
    if (!part.added && !part.removed) {
      for (let i = 0; i < count; i++) map.set(live + i + 1, { kind: 'clean', headLine: head + i + 1 })
      head += count
      live += count
    } else if (part.removed) {
      head += count
    } else {
      for (let i = 0; i < count; i++) map.set(live + i + 1, { kind: 'uncommitted' })
      live += count
    }
  }

  return map
}
