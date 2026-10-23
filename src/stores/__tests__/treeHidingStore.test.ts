import { describe, it, expect, beforeEach, vi } from 'vitest'

const { localStorageStore } = vi.hoisted(() => {
  const localStorageStore: Record<string, string> = {}
  ;(global as any).localStorage = {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
  }
  return { localStorageStore }
})

vi.mock('../../lib/notifySettingChanged', () => ({ notifySettingChanged: vi.fn() }))

const ROOT = '/Users/me/repo'

describe('treeHidingStore', () => {
  beforeEach(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k])
    vi.resetModules()
  })

  it('starts with the defaults for a repo it has no rules for', async () => {
    const { useTreeHidingStore, selectRules } = await import('../treeHidingStore')
    const { DEFAULT_HIDE_RULES } = await import('../../lib/treeHiding')
    expect(selectRules(useTreeHidingStore.getState().byRepo, ROOT)).toEqual(DEFAULT_HIDE_RULES)
    expect(selectRules(useTreeHidingStore.getState().byRepo, null)).toEqual(DEFAULT_HIDE_RULES)
  })

  it('saves rules per repo under the synced key, without duplicates', async () => {
    const { useTreeHidingStore, selectRules, TREE_HIDING_KEY } = await import('../treeHidingStore')
    const s = useTreeHidingStore.getState()
    s.hidePath(ROOT, 'dist')
    s.hidePath(ROOT, 'dist')
    s.hideName(ROOT, '.DS_Store')
    s.hideExtension(ROOT, 'log')
    s.setToggle(ROOT, 'showHidden', true)
    s.hidePath('/Users/me/other', 'build')

    const rules = selectRules(useTreeHidingStore.getState().byRepo, ROOT)
    expect(rules.paths).toEqual(['dist'])
    expect(rules.names).toEqual(['.DS_Store'])
    expect(rules.extensions).toEqual(['log'])
    expect(rules.showHidden).toBe(true)
    expect(TREE_HIDING_KEY.startsWith('vide:general:')).toBe(true)
    const saved = JSON.parse(localStorageStore[TREE_HIDING_KEY])
    expect(Object.keys(saved)).toEqual(['~/repo', '~/other'])
  })

  it('finds the same rules from a Linux path to the repo', async () => {
    const { useTreeHidingStore, selectRules } = await import('../treeHidingStore')
    useTreeHidingStore.getState().hidePath(ROOT, 'dist')
    expect(selectRules(useTreeHidingStore.getState().byRepo, '/home/me/repo').paths).toEqual(['dist'])
  })

  it('unhides an item', async () => {
    const { useTreeHidingStore, selectRules } = await import('../treeHidingStore')
    const s = useTreeHidingStore.getState()
    s.hidePath(ROOT, 'dist')
    s.unhide(ROOT, 'dist/a.js', false)
    expect(selectRules(useTreeHidingStore.getState().byRepo, ROOT).paths).toEqual([])
  })

  it('drops malformed stored data', async () => {
    localStorageStore['vide:general:siteTreeHidden'] = JSON.stringify({
      '~/repo': { paths: ['a', 3], names: 'x', showDotfiles: 'no' },
      broken: 5,
    })
    const { useTreeHidingStore } = await import('../treeHidingStore')
    const byRepo = useTreeHidingStore.getState().byRepo
    expect(Object.keys(byRepo)).toEqual(['~/repo'])
    expect(byRepo['~/repo'].paths).toEqual(['a'])
    expect(byRepo['~/repo'].names).toEqual([])
    expect(byRepo['~/repo'].showDotfiles).toBe(true)
  })

  it('applies All repos rules in every repo, and keeps the merged object stable', async () => {
    const { useTreeHidingStore, selectRules, selectOwnRules, GLOBAL_RULES_KEY } = await import('../treeHidingStore')
    const s = useTreeHidingStore.getState()
    s.hidePath(ROOT, 'dist')
    s.moveRule('~/repo', GLOBAL_RULES_KEY, 'paths', 'dist')
    s.hideName('/Users/me/other', 'tmp')
    const byRepo = useTreeHidingStore.getState().byRepo
    expect(selectOwnRules(byRepo, '~/repo').paths).toEqual([])
    expect(selectRules(byRepo, ROOT).paths).toEqual(['dist'])
    expect(selectRules(byRepo, '/Users/me/other')).toMatchObject({ paths: ['dist'], names: ['tmp'] })
    expect(selectRules(byRepo, ROOT)).toBe(selectRules(byRepo, ROOT))
  })

  it('unhide also drops a matching All repos rule', async () => {
    const { useTreeHidingStore, selectRules, GLOBAL_RULES_KEY } = await import('../treeHidingStore')
    const s = useTreeHidingStore.getState()
    s.hideName(ROOT, 'node_modules')
    s.moveRule('~/repo', GLOBAL_RULES_KEY, 'names', 'node_modules')
    s.unhide(ROOT, 'node_modules', true)
    expect(selectRules(useTreeHidingStore.getState().byRepo, ROOT).names).toEqual([])
  })

  it('removes rules, sets switches by key, and resets one key or everything', async () => {
    const { useTreeHidingStore, selectOwnRules } = await import('../treeHidingStore')
    const s = useTreeHidingStore.getState()
    s.hideExtension(ROOT, 'log')
    s.hideExtension(ROOT, 'tmp')
    s.removeRule('~/repo', 'extensions', 'log')
    s.setToggleForKey('~/repo', 'showDotfiles', false)
    let own = selectOwnRules(useTreeHidingStore.getState().byRepo, '~/repo')
    expect(own.extensions).toEqual(['tmp'])
    expect(own.showDotfiles).toBe(false)
    s.hidePath('/Users/me/other', 'x')
    s.resetKey('~/repo')
    expect(Object.keys(useTreeHidingStore.getState().byRepo)).toEqual(['~/other'])
    s.resetAll()
    expect(useTreeHidingStore.getState().byRepo).toEqual({})
    own = selectOwnRules(useTreeHidingStore.getState().byRepo, '~/repo')
    expect(own.showDotfiles).toBe(true)
  })
})
