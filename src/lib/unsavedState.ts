import type { Tab } from '@/types/index'
import { isScratchTab } from '@/components/Editor/paths'
import { isReadOnlyTab } from '@/lib/tabKinds'

export interface UnsavedState {
  dirty: number
  neverSaved: number
}

// Two separate tallies because the consequences differ: a dirty tab backed by
// a real file loses only the edits since its last save, while a scratch tab
// that has never been saved loses everything. The window-close prompt says so
// in those terms. Read-only tabs (diffs, logs, settings, terminals) can't hold
// unsaved work at all and never count.
export function countUnsaved(tabs: Tab[]): UnsavedState {
  let dirty = 0
  let neverSaved = 0
  for (const tab of tabs) {
    if (isReadOnlyTab(tab)) continue
    if (isScratchTab(tab.path)) {
      if (tab.content !== '') neverSaved++
    } else if (tab.dirty) {
      dirty++
    }
  }
  return { dirty, neverSaved }
}
