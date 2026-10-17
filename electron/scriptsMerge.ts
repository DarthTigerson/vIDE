import type { ScriptsData } from './scriptsData'

// vIDE Sync's script merge: additive by id, and for an id on both sides the
// most recently updated copy wins (ties go to b). Deletes are tombstones with
// their own updatedAt, so they win or lose against edits the same way.
// The result is in a canonical order (createdAt, then id) so two machines
// merging the same scripts write byte-identical files — otherwise each would
// keep reordering the synced file and commit on every periodic push.
export function mergeScriptsData(a: ScriptsData, b: ScriptsData): ScriptsData {
  const aById = new Map(a.scripts.map((s) => [s.id, s]))
  const bIds = new Set(b.scripts.map((s) => s.id))
  const merged = [
    ...b.scripts.map((fromB) => {
      const fromA = aById.get(fromB.id)
      return fromA && fromA.updatedAt > fromB.updatedAt ? fromA : fromB
    }),
    ...a.scripts.filter((s) => !bIds.has(s.id)),
  ]
  merged.sort((x, y) => x.createdAt - y.createdAt || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
  return { scripts: merged }
}
