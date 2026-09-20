import { create } from 'zustand'
import type { SearchBatch, SearchDone, SearchHit } from '../../electron/searchTypes'
import { useEditorStore } from './editorStore'
import { useFileStore } from './fileStore'
import { openFileAtLocation } from '@/lib/openFileLocation'
import { pathAllowed, searchInMemory } from '@/lib/searchInMemory'
import { replaceInContent, type ReplaceOptions } from '@/lib/replaceInContent'

// All state of the sidebar Global Search panel lives here rather than in the
// component: the sidebar panels are conditionally rendered, so switching to Git
// and back unmounts the panel, and results must survive that (and survive
// opening a file — the whole reason this replaced the old modal).

export interface ResultGroup {
  path: string
  hits: SearchHit[]
  // The file was edited after this search ran, so its hits may have moved.
  stale: boolean
}

// What a replace changed in one file, kept so it can be undone.
export interface ReplaceRecord {
  path: string
  before: string
  after: string
  // Edited in an open tab (left unsaved) rather than written to disk.
  inTab: boolean
  // The tab already had unsaved edits before the replace.
  wasDirty: boolean
}

export interface ReplaceOutcome {
  message: string
  // Empty when nothing was changed (nothing to undo).
  records: ReplaceRecord[]
}

export type SearchStatus = 'idle' | 'searching' | 'done' | 'error'
export type SearchToggle = 'caseSensitive' | 'wholeWord' | 'regex'

const DEBOUNCE_MS = 300

export function hitKey(hit: SearchHit): string {
  return `${hit.path}:${hit.line}:${hit.col}`
}

interface GlobalSearchState {
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  include: string
  exclude: string

  status: SearchStatus
  error: string | null
  truncated: boolean
  groups: ResultGroup[]
  matchCount: number
  // Something changed on disk since the search ran (typically an agent
  // editing files); the list itself is left alone until the user refreshes.
  diskChanged: boolean
  collapsed: Record<string, true>
  activeKey: string | null
  // Bumped to ask the panel's input to take focus (Find in Files shortcut).
  focusTick: number

  replacement: string
  replacing: boolean
  // Set while the "Replace N matches in M files?" confirmation is showing.
  pendingReplaceAll: { matches: number; files: number } | null
  replaceOutcome: ReplaceOutcome | null

  // Internal bookkeeping for the search currently in flight / last completed.
  searchId: string | null
  root: string | null

  setQuery: (query: string) => void
  setInclude: (include: string) => void
  setExclude: (exclude: string) => void
  toggle: (flag: SearchToggle) => void
  runNow: () => void
  refresh: () => void
  clear: () => void
  requestFocus: () => void
  toggleCollapsed: (path: string) => void
  moveActive: (delta: 1 | -1) => SearchHit | null
  openHit: (hit: SearchHit) => Promise<void>

  setReplacement: (replacement: string) => void
  replaceHit: (hit: SearchHit) => Promise<void>
  replaceFile: (path: string) => Promise<void>
  requestReplaceAll: () => void
  cancelReplaceAll: () => void
  confirmReplaceAll: () => Promise<void>
  undoReplace: () => Promise<void>
  dismissReplaceOutcome: () => void
}

const emptyResults = {
  status: 'idle' as SearchStatus,
  error: null,
  truncated: false,
  groups: [] as ResultGroup[],
  matchCount: 0,
  diskChanged: false,
  activeKey: null,
  searchId: null,
  root: null,
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let searchCounter = 0
let wired = false

function clearDebounce() {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`
}

function visibleHits(state: GlobalSearchState): SearchHit[] {
  return state.groups.filter((g) => !state.collapsed[g.path]).flatMap((g) => g.hits)
}

export const useGlobalSearchStore = create<GlobalSearchState>((set, get) => {
  function schedule() {
    clearDebounce()
    if (!get().query.trim()) { get().clear(); return }
    debounceTimer = setTimeout(() => get().runNow(), DEBOUNCE_MS)
  }

  return {
    query: '',
    caseSensitive: false,
    wholeWord: false,
    regex: false,
    include: '',
    exclude: '',
    ...emptyResults,
    collapsed: {},
    focusTick: 0,
    replacement: '',
    replacing: false,
    pendingReplaceAll: null,
    replaceOutcome: null,

    setQuery: (query) => { set({ query }); schedule() },
    setInclude: (include) => { set({ include }); if (get().query.trim()) schedule() },
    setExclude: (exclude) => { set({ exclude }); if (get().query.trim()) schedule() },
    toggle: (flag) => {
      set({ [flag]: !get()[flag] } as Pick<GlobalSearchState, SearchToggle>)
      if (get().query.trim()) get().runNow()
    },

    runNow: () => {
      clearDebounce()
      const state = get()
      const root = useFileStore.getState().projectRoot
      if (!root || !state.query.trim()) { state.clear(); return }
      wire()

      const options = {
        query: state.query,
        caseSensitive: state.caseSensitive,
        wholeWord: state.wholeWord,
        regex: state.regex,
        include: state.include,
        exclude: state.exclude,
      }

      // ripgrep only sees what is on disk. Tabs with unsaved edits are searched
      // here from memory instead (and ripgrep is told to skip those files), so
      // results always match what is in the editor.
      const dirtyTabs = useEditorStore.getState().tabs.filter(
        (t) => t.dirty && pathAllowed(t.path, root, options.include, options.exclude),
      )
      const memoryGroups: ResultGroup[] = []
      let memoryFailed = false
      for (const tab of dirtyTabs) {
        const result = searchInMemory(tab.content, tab.path, options)
        if (result.error) { memoryFailed = true; break }
        if (result.hits.length > 0) memoryGroups.push({ path: tab.path, hits: result.hits, stale: false })
      }
      // A pattern JS can't parse but Rust can (e.g. `(?P<name>…)`) shouldn't
      // block the search or raise a misleading error: drop the in-memory pass
      // and let ripgrep read the on-disk version of those files instead.
      const skipPaths = memoryFailed ? [] : dirtyTabs.map((t) => t.path)
      const groups = memoryFailed ? [] : memoryGroups

      const id = `s${++searchCounter}`
      set({
        ...emptyResults,
        status: 'searching',
        groups,
        matchCount: groups.reduce((n, g) => n + g.hits.length, 0),
        searchId: id,
        root,
      })
      window.api.searchStart(id, root, { ...options, skipPaths })
    },

    refresh: () => get().runNow(),

    clear: () => {
      clearDebounce()
      const { status, searchId } = get()
      if (status === 'searching' && searchId) window.api.searchCancel(searchId)
      set({ ...emptyResults })
    },

    requestFocus: () => set({ focusTick: get().focusTick + 1 }),

    toggleCollapsed: (path) => {
      const collapsed = { ...get().collapsed }
      if (collapsed[path]) delete collapsed[path]
      else collapsed[path] = true
      set({ collapsed })
    },

    moveActive: (delta) => {
      const hits = visibleHits(get())
      if (hits.length === 0) return null
      const current = hits.findIndex((h) => hitKey(h) === get().activeKey)
      const next = current === -1
        ? (delta === 1 ? 0 : hits.length - 1)
        : Math.min(hits.length - 1, Math.max(0, current + delta))
      set({ activeKey: hitKey(hits[next]) })
      return hits[next]
    },

    // Deliberately leaves the result list untouched — that's the point.
    openHit: async (hit) => {
      set({ activeKey: hitKey(hit) })
      // Highlight what actually matched (right for regex too), not the query.
      const matched = hit.text.slice(hit.matchStart, hit.matchStart + hit.length)
      await openFileAtLocation(hit.path, hit.line, hit.col, matched)
    },

    setReplacement: (replacement) => set({ replacement }),

    replaceHit: (hit) => runReplace(get, set, [{ path: hit.path, hits: [hit] }]),

    replaceFile: async (path) => {
      const group = get().groups.find((g) => g.path === path)
      if (group) await runReplace(get, set, [{ path, hits: group.hits }])
    },

    requestReplaceAll: () => {
      const { groups, status, replacing } = get()
      if (status !== 'done' || replacing) return
      const matches = groups.reduce((n, g) => n + g.hits.length, 0)
      if (matches === 0) return
      set({ pendingReplaceAll: { matches, files: groups.length } })
    },

    cancelReplaceAll: () => set({ pendingReplaceAll: null }),

    confirmReplaceAll: async () => {
      if (!get().pendingReplaceAll) return
      set({ pendingReplaceAll: null })
      await runReplace(get, set, get().groups.map((g) => ({ path: g.path, hits: g.hits })))
    },

    undoReplace: async () => {
      const outcome = get().replaceOutcome
      if (!outcome || outcome.records.length === 0 || get().replacing) return
      set({ replacing: true })

      let conflicts = 0
      for (const record of outcome.records) {
        if (record.inTab) {
          const tab = useEditorStore.getState().tabs.find((t) => t.path === record.path)
          if (!tab) continue // closed since: the edit only ever lived in memory
          if (tab.content !== record.after) { conflicts++; continue }
          useEditorStore.getState().updateContent(record.path, record.before)
          if (!record.wasDirty) useEditorStore.getState().markSaved(record.path, record.before)
        } else {
          try {
            const current = await window.api.readFile(record.path)
            if (current !== record.after) { conflicts++; continue }
            await window.api.writeFile(record.path, record.before)
          } catch {
            conflicts++
          }
        }
      }

      set({
        replacing: false,
        replaceOutcome: conflicts > 0
          ? { message: `Undone, except ${plural(conflicts, 'file')} that changed since the replace and ${conflicts === 1 ? 'was' : 'were'} left alone`, records: [] }
          : null,
      })
      get().runNow()
    },

    dismissReplaceOutcome: () => set({ replaceOutcome: null }),
  }
})

type StoreGet = () => GlobalSearchState
type StoreSet = (partial: Partial<GlobalSearchState>) => void

// Replaces the given hits, file by file. Files open in a tab are edited in
// place and left unsaved (like typing would); everything else is written to
// disk. Every hit is re-checked against the file's content as it is now, so a
// file that changed since the search is skipped rather than clobbered.
async function runReplace(get: StoreGet, set: StoreSet, targets: Array<{ path: string; hits: SearchHit[] }>): Promise<void> {
  const state = get()
  if (state.status !== 'done' || state.replacing || targets.length === 0) return
  set({ replacing: true, replaceOutcome: null })

  const options: ReplaceOptions = {
    query: state.query,
    caseSensitive: state.caseSensitive,
    wholeWord: state.wholeWord,
    regex: state.regex,
    replacement: state.replacement,
  }

  const records: ReplaceRecord[] = []
  let replaced = 0
  let skipped = 0
  let failed = 0
  for (const target of targets) {
    try {
      const tab = useEditorStore.getState().tabs.find((t) => t.path === target.path)
      const before = tab ? tab.content : await window.api.readFile(target.path)
      const result = replaceInContent(before, target.hits, options)
      skipped += result.skipped
      if (result.error || result.replaced === 0) continue

      if (tab) useEditorStore.getState().updateContent(target.path, result.content)
      else await window.api.writeFile(target.path, result.content)
      records.push({ path: target.path, before, after: result.content, inTab: !!tab, wasDirty: !!tab?.dirty })
      replaced += result.replaced
    } catch {
      failed++
    }
  }

  const notes = [
    skipped > 0 ? `${skipped.toLocaleString()} no longer matched` : null,
    failed > 0 ? `${plural(failed, 'file')} could not be updated` : null,
  ].filter(Boolean)
  const message = replaced > 0
    ? [`Replaced ${plural(replaced, 'match', 'matches')} in ${plural(records.length, 'file')}`, ...notes].join('; ')
    : skipped > 0
      ? 'Nothing replaced — the files changed since this search. Refresh and try again.'
      : failed > 0 ? `${plural(failed, 'file')} could not be updated` : 'Nothing to replace'

  set({ replacing: false, replaceOutcome: { message, records } })
  // The list is now out of date (replaced hits are gone); search again.
  get().runNow()
}

function onResults(batch: SearchBatch) {
  const state = useGlobalSearchStore.getState()
  if (batch.searchId !== state.searchId) return

  const touched = new Map<string, ResultGroup>()
  const existing = new Map(state.groups.map((g) => [g.path, g]))
  for (const hit of batch.hits) {
    let group = touched.get(hit.path)
    if (!group) {
      const prior = existing.get(hit.path)
      group = prior ? { ...prior, hits: [...prior.hits] } : { path: hit.path, hits: [], stale: false }
      touched.set(hit.path, group)
    }
    group.hits.push(hit)
  }
  const groups = [
    ...state.groups.map((g) => touched.get(g.path) ?? g),
    ...[...touched.values()].filter((g) => !existing.has(g.path)),
  ]
  useGlobalSearchStore.setState({ groups, matchCount: state.matchCount + batch.hits.length })
}

function onDone(done: SearchDone) {
  if (done.searchId !== useGlobalSearchStore.getState().searchId) return
  useGlobalSearchStore.setState({
    status: done.error ? 'error' : 'done',
    error: done.error ?? null,
    truncated: done.truncated,
  })
}

// Wired lazily on first search (rather than at import) so the store stays inert
// until the panel is actually used.
function wire() {
  if (wired) return
  wired = true

  window.api.onSearchResults(onResults)
  window.api.onSearchDone(onDone)

  window.api.onFsChanged((cwd) => {
    const { status, root } = useGlobalSearchStore.getState()
    if (status === 'done' && cwd === root) useGlobalSearchStore.setState({ diskChanged: true })
  })

  // A file edited in the editor after the search ran has stale hits. Compare
  // content against the previous tab state so merely saving (content
  // unchanged) or opening a tab doesn't count.
  useEditorStore.subscribe((state, prev) => {
    if (state.tabs === prev.tabs) return
    const { groups } = useGlobalSearchStore.getState()
    if (groups.length === 0) return
    const before = new Map(prev.tabs.map((t) => [t.path, t.content]))
    const changed = new Set<string>()
    for (const tab of state.tabs) {
      const old = before.get(tab.path)
      if (old !== undefined && old !== tab.content) changed.add(tab.path)
    }
    if (!groups.some((g) => changed.has(g.path) && !g.stale)) return
    useGlobalSearchStore.setState({
      groups: groups.map((g) => (changed.has(g.path) && !g.stale ? { ...g, stale: true } : g)),
    })
  })

  useFileStore.subscribe((state, prev) => {
    if (state.projectRoot === prev.projectRoot) return
    useGlobalSearchStore.getState().clear()
    useGlobalSearchStore.getState().dismissReplaceOutcome()
  })
}
