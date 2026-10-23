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

interface TreeHidingStore {
  byRepo: RulesByRepo
  hidePath: (root: string, rel: string) => void
  hideName: (root: string, name: string) => void
  hideExtension: (root: string, ext: string) => void
  unhide: (root: string, rel: string, isDirectory: boolean) => void
  setToggle: (root: string, toggle: HideToggle, value: boolean) => void
}

export function selectRules(byRepo: RulesByRepo, root: string | null): RepoHideRules {
  return (root && byRepo[repoKey(root)]) || DEFAULT_HIDE_RULES
}

export const useTreeHidingStore = create<TreeHidingStore>((set, get) => {
  function update(root: string, change: (rules: RepoHideRules) => RepoHideRules) {
    const key = repoKey(root)
    const byRepo = { ...get().byRepo, [key]: change(selectRules(get().byRepo, root)) }
    try { localStorage.setItem(TREE_HIDING_KEY, JSON.stringify(byRepo)) } catch {}
    set({ byRepo })
    notifySettingChanged()
  }
  return {
    byRepo: load(),
    hidePath: (root, rel) => update(root, (r) => ({ ...r, paths: addUnique(r.paths, rel) })),
    hideName: (root, name) => update(root, (r) => ({ ...r, names: addUnique(r.names, name) })),
    hideExtension: (root, ext) => update(root, (r) => ({ ...r, extensions: addUnique(r.extensions, ext) })),
    unhide: (root, rel, isDirectory) => update(root, (r) => removeRulesFor(rel, isDirectory, r)),
    setToggle: (root, toggle, value) => update(root, (r) => ({ ...r, [toggle]: value })),
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
