import { describe, it, expect, beforeEach, vi } from 'vitest'

// Some stores read localStorage at import time, and this suite runs in node.
vi.hoisted(() => {
  const data = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
})

vi.mock('@/lib/platform', () => ({ isMac: true }))

import * as paths from '@/components/Settings/paths'
import { pageCommands, SETTINGS_PAGES } from '../pageCommands'
import { usePanelRequestStore } from '@/stores/panelRequestStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'

const find = (id: string) => {
  const cmd = pageCommands().find((c) => c.id === id)
  if (!cmd) throw new Error(`missing command ${id}`)
  return cmd
}

describe('settings pages', () => {
  it('covers every settings:// tab path defined in paths.ts', () => {
    const defined = Object.values(paths).filter(
      (v): v is string => typeof v === 'string' && v.startsWith('settings://'),
    )
    const covered = new Set(SETTINGS_PAGES.map((p) => p.path))
    for (const path of defined) expect(covered.has(path), `${path} has no palette command`).toBe(true)
  })

  it('labels every page "Settings: <Name>" with a unique id', () => {
    for (const page of SETTINGS_PAGES) expect(page.label).toMatch(/^Settings: /)
    expect(new Set(SETTINGS_PAGES.map((p) => p.id)).size).toBe(SETTINGS_PAGES.length)
  })
})

describe('view commands', () => {
  beforeEach(() => {
    usePanelRequestStore.setState({ request: null })
  })

  it('View: Notes and View: Todo Board request their sidebar panels', () => {
    find('view-notes').action?.()
    expect(usePanelRequestStore.getState().request?.panel).toBe('notes')
    find('view-todo-board').action?.()
    expect(usePanelRequestStore.getState().request?.panel).toBe('todos')
  })

  it('View: Graphify Graph is greyed while Graphify is disabled', () => {
    useGraphifySettingsStore.setState({ enabled: false })
    expect(find('view-graphify-graph').disabledReason?.()).toBe('Enable Graphify in Settings')
    useGraphifySettingsStore.setState({ enabled: true })
    expect(find('view-graphify-graph').disabledReason?.()).toBeNull()
  })

  it('has a Usage Graph view', () => {
    expect(find('view-usage-graph').label).toBe('View: Usage Graph')
  })
})
