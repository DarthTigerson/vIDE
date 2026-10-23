import { create } from 'zustand'
import { notifySettingChanged } from '../lib/notifySettingChanged'
import {
  DEFAULT_HIDE_RULES,
  removeRulesFor,
  repoKey,
  type HideToggle,
  type RepoHideRules,
} from '../lib/treeHiding'

// Under 'vide:general:' so vIDE Sync carries it between machines. It only
// changes on a click in the Site Tree's Hide submenu, so it can't add a commit
// on every periodic push.
export const TREE_HIDING_KEY = 'vide:general:siteTreeHidden'

type RulesByRepo = Record<string, RepoHideRules>

// The entry for rules that apply in every repo (its switches are unused).
export const GLOBAL_RULES_KEY = '*'

export type RuleKind = 'paths' | 'names' | 'extensions'

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function sanitize(raw: unknown): RulesByRepo {
  if (!raw || typeof raw !== 'object') return {}
  const out: RulesByRepo = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    const bool = (k: HideToggle) => (typeof v[k] === 'boolean' ? (v[k] as boolean) : DEFAULT_HIDE_RULES[k])
    out[key] = {
      paths: strings(v.paths),
      names: strings(v.names),
      extensions: strings(v.extensions),
      showHidden: bool('showHidden'),
      showGitignored: bool('showGitignored'),
      showDotfiles: bool('showDotfiles'),
      showGraphify: bool('showGraphify'),
    }
  }
  return out
}

function load(): RulesByRepo {
  try {
    const raw = localStorage.getItem(TREE_HIDING_KEY)
    return raw === null ? {} : sanitize(JSON.parse(raw))
  } catch {
    return {}
  }
}

function addUnique(list: string[], value: string): string[] {
  return list.includes(value) ? list : [...list, value]
}

// The actions below take a project root; the Settings page, which also lists
// repos that aren't open, works on stored keys (repoKey(root) or
// GLOBAL_RULES_KEY) instead.
interface TreeHidingStore {
  byRepo: RulesByRepo
  hidePath: (root: string, rel: string) => void
  hideName: (root: string, name: string) => void
  hideExtension: (root: string, ext: string) => void
  // Drops every rule hiding the item, the repo's own and All repos' alike.
  unhide: (root: string, rel: string, isDirectory: boolean) => void
  setToggle: (root: string, toggle: HideToggle, value: boolean) => void
  setToggleForKey: (key: string, toggle: HideToggle, value: boolean) => void
  removeRule: (key: string, kind: RuleKind, value: string) => void
  moveRule: (fromKey: string, toKey: string, kind: RuleKind, value: string) => void
  resetKey: (key: string) => void
  resetAll: () => void
}

// One stored entry as saved: a repo's own rules and switches, or All repos'.
export function selectOwnRules(byRepo: RulesByRepo, key: string): RepoHideRules {
  return byRepo[key] ?? DEFAULT_HIDE_RULES
}

// Merged results per state object, so a component selecting them gets the
// same object back until the rules change (a fresh one every call would make
// zustand re-render forever).
const mergedCache = new WeakMap<RulesByRepo, Map<string, RepoHideRules>>()

// What applies in a repo: its own rules plus All repos' rules, with the
// repo's own switches.
export function selectRules(byRepo: RulesByRepo, root: string | null): RepoHideRules {
  const own = (root && byRepo[repoKey(root)]) || DEFAULT_HIDE_RULES
  const global = byRepo[GLOBAL_RULES_KEY]
  if (!global) return own
  const cacheKey = root ? repoKey(root) : ''
  let perState = mergedCache.get(byRepo)
  if (!perState) mergedCache.set(byRepo, (perState = new Map()))
  const cached = perState.get(cacheKey)
  if (cached) return cached
  const merge = (a: string[], b: string[]) => [...a, ...b.filter((v) => !a.includes(v))]
  const merged = {
    ...own,
    paths: merge(own.paths, global.paths),
    names: merge(own.names, global.names),
    extensions: merge(own.extensions, global.extensions),
  }
  perState.set(cacheKey, merged)
  return merged
}

export const useTreeHidingStore = create<TreeHidingStore>((set, get) => {
  function save(byRepo: RulesByRepo) {
    try { localStorage.setItem(TREE_HIDING_KEY, JSON.stringify(byRepo)) } catch {}
    set({ byRepo })
    notifySettingChanged()
  }
  function updateKey(key: string, change: (rules: RepoHideRules) => RepoHideRules) {
    save({ ...get().byRepo, [key]: change(selectOwnRules(get().byRepo, key)) })
  }
  function update(root: string, change: (rules: RepoHideRules) => RepoHideRules) {
    updateKey(repoKey(root), change)
  }
  return {
    byRepo: load(),
    hidePath: (root, rel) => update(root, (r) => ({ ...r, paths: addUnique(r.paths, rel) })),
    hideName: (root, name) => update(root, (r) => ({ ...r, names: addUnique(r.names, name) })),
    hideExtension: (root, ext) => update(root, (r) => ({ ...r, extensions: addUnique(r.extensions, ext) })),
    unhide: (root, rel, isDirectory) => {
      const byRepo = { ...get().byRepo }
      for (const key of [repoKey(root), GLOBAL_RULES_KEY]) {
        if (byRepo[key]) byRepo[key] = removeRulesFor(rel, isDirectory, byRepo[key])
      }
      save(byRepo)
    },
    setToggle: (root, toggle, value) => update(root, (r) => ({ ...r, [toggle]: value })),
    setToggleForKey: (key, toggle, value) => updateKey(key, (r) => ({ ...r, [toggle]: value })),
    removeRule: (key, kind, value) => updateKey(key, (r) => ({ ...r, [kind]: r[kind].filter((v) => v !== value) })),
    moveRule: (fromKey, toKey, kind, value) => {
      const byRepo = get().byRepo
      const from = selectOwnRules(byRepo, fromKey)
      const to = selectOwnRules(byRepo, toKey)
      save({
        ...byRepo,
        [fromKey]: { ...from, [kind]: from[kind].filter((v) => v !== value) },
        [toKey]: { ...to, [kind]: addUnique(to[kind], value) },
      })
    },
    resetKey: (key) => {
      const { [key]: _removed, ...rest } = get().byRepo
      save(rest)
    },
    resetAll: () => save({}),
  }
})

// Other windows share this localStorage; the 'storage' event fires in every
// window except the one that wrote, so each picks up the change live.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== TREE_HIDING_KEY) return
    useTreeHidingStore.setState({ byRepo: load() })
  })
}
