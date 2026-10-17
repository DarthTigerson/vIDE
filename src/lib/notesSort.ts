import type { FileNode } from '@/types/index'

export type NotesSortMode = 'alphabetical' | 'created' | 'updated' | 'manual'

export const NOTES_SORT_MODES: { mode: NotesSortMode; title: string }[] = [
  { mode: 'alphabetical', title: 'Alphabetical' },
  { mode: 'created', title: 'Created' },
  { mode: 'updated', title: 'Updated' },
  { mode: 'manual', title: 'Manual' },
]

// Manual order per folder: the folder's path relative to the notes root
// ('' for the root itself) → its entries' names in the user's order. Relative
// because the notes root's absolute path differs per machine, and this syncs.
export type NotesManualOrder = Record<string, string[]>

export type DropPlacement = 'before' | 'after'

function compareNames(a: FileNode, b: FileNode): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
}

// A view-only sort for the Notes tree; folders always stay above notes.
// Created runs oldest first (the order things were written in), Updated
// newest first (what was just worked on at the top). In Manual, entries the
// user never placed (e.g. new notes) go to the bottom, alphabetically.
export function sortNotes(nodes: FileNode[], mode: NotesSortMode, manualOrder: string[] = []): FileNode[] {
  const rank = new Map(manualOrder.map((name, index) => [name, index]))
  const compare = (a: FileNode, b: FileNode): number => {
    switch (mode) {
      case 'alphabetical':
        return compareNames(a, b)
      case 'created':
        return (a.createdMs ?? 0) - (b.createdMs ?? 0) || compareNames(a, b)
      case 'updated':
        return (b.updatedMs ?? 0) - (a.updatedMs ?? 0) || compareNames(a, b)
      case 'manual':
        return (rank.get(a.name) ?? Infinity) - (rank.get(b.name) ?? Infinity) || compareNames(a, b)
    }
  }
  const folders = nodes.filter((n) => n.isDirectory).sort(compare)
  const notes = nodes.filter((n) => !n.isDirectory).sort(compare)
  return [...folders, ...notes]
}

// `names` is the folder's current displayed order; returns it with `source`
// moved before/after `target` (adding `source` if it just arrived from
// another folder).
export function placeName(names: string[], source: string, target: string, placement: DropPlacement): string[] {
  if (source === target) return names
  const rest = names.filter((name) => name !== source)
  const index = rest.indexOf(target)
  if (index === -1) return [...rest, source]
  rest.splice(placement === 'before' ? index : index + 1, 0, source)
  return rest
}

function splitRelPath(relPath: string): { parent: string; name: string } {
  const idx = relPath.lastIndexOf('/')
  return idx === -1 ? { parent: '', name: relPath } : { parent: relPath.slice(0, idx), name: relPath.slice(idx + 1) }
}

// Keeps the manual order in step with a rename or move (both relative to the
// notes root): a rename in place keeps the entry's position, a move drops it
// from the old folder's list (it lands at the bottom of the new one), and a
// moved/renamed folder carries its own and its subfolders' orders with it.
export function renameInOrder(order: NotesManualOrder, oldRelPath: string, newRelPath: string): NotesManualOrder {
  const from = splitRelPath(oldRelPath)
  const to = splitRelPath(newRelPath)
  const next: NotesManualOrder = {}
  for (const [key, names] of Object.entries(order)) {
    const rekeyed =
      key === oldRelPath ? newRelPath : key.startsWith(oldRelPath + '/') ? newRelPath + key.slice(oldRelPath.length) : key
    next[rekeyed] = names
  }
  const list = next[from.parent]
  if (list?.includes(from.name)) {
    next[from.parent] =
      from.parent === to.parent
        ? list.map((name) => (name === from.name ? to.name : name))
        : list.filter((name) => name !== from.name)
  }
  return next
}
