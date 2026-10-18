import { describe, it, expect } from 'vitest'
import { SHORTCUT_GROUPS } from '../shortcuts'

describe('SHORTCUT_GROUPS', () => {
  it('has the five expected categories in order', () => {
    expect(SHORTCUT_GROUPS.map((g) => g.category)).toEqual(['Navigation', 'Editor', 'Project', 'App', 'Display'])
  })

  it('lists 32 shortcuts total, each with a label and at least one key', () => {
    const items = SHORTCUT_GROUPS.flatMap((g) => g.items)
    expect(items).toHaveLength(32)
    for (const item of items) {
      expect(item.label.length).toBeGreaterThan(0)
      expect(item.keys.length).toBeGreaterThan(0)
    }
  })

  it('includes the sidebar toggle, action palette, and chat panel shortcuts', () => {
    const nav = SHORTCUT_GROUPS.find((g) => g.category === 'Navigation')!
    expect(nav.items).toContainEqual({ keys: ['⌘', 'B'], label: 'Toggle Sidebar' })
    expect(nav.items).toContainEqual({ keys: ['⌘', '⇧', 'P'], label: 'Action Palette' })
    expect(nav.items).toContainEqual({ keys: ['⌘', 'L'], label: 'Send Selection to Chat / Show Chat' })
  })
})
