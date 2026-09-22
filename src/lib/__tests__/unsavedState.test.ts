import { describe, it, expect } from 'vitest'
import { countUnsaved } from '../unsavedState'
import { buildScratchPath } from '@/components/Editor/paths'
import { GENERAL_SETTINGS_TAB_PATH } from '@/components/Settings/paths'
import type { Tab } from '@/types/index'

const tab = (path: string, content: string, dirty: boolean): Tab => ({ path, content, dirty })

describe('countUnsaved', () => {
  it('counts nothing when every tab is saved', () => {
    expect(countUnsaved([tab('/a.ts', 'x', false)])).toEqual({ dirty: 0, neverSaved: 0 })
  })

  // The two are reported separately because the consequence differs: a dirty
  // file reverts to its last save, a scratch file is gone entirely.
  it('separates dirty files from never-saved scratch files', () => {
    const tabs = [
      tab('/a.ts', 'x', true),
      tab('/b.ts', 'y', true),
      tab(buildScratchPath('1'), 'draft', true),
    ]
    expect(countUnsaved(tabs)).toEqual({ dirty: 2, neverSaved: 1 })
  })

  it('ignores an empty scratch tab — there is nothing to lose', () => {
    expect(countUnsaved([tab(buildScratchPath('1'), '', false)])).toEqual({ dirty: 0, neverSaved: 0 })
  })

  it('ignores read-only tabs, which cannot hold unsaved work', () => {
    expect(countUnsaved([tab(GENERAL_SETTINGS_TAB_PATH, '', true)])).toEqual({ dirty: 0, neverSaved: 0 })
  })
})
