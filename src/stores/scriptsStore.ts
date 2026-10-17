import { create } from 'zustand'
import type { Script, ScriptTags, ScriptInput, ScriptPatch } from '@/types/api'
import { notifySettingChanged, notifyNoteChanged } from '@/lib/notifySettingChanged'

interface ScriptsStore {
  scripts: Script[]
  tags: ScriptTags
  loaded: boolean
  // Terminals opened to run a script are labelled with its title instead of
  // the generic "Terminal" (terminal id → title).
  terminalTitles: Record<string, string>
  setTerminalTitle: (terminalId: string, title: string) => void
  load: () => Promise<void>
  create: (input: ScriptInput) => Promise<Script>
  // fromEditor: typing in a script's tab — synced on the 20s note debounce
  // instead of the 2s settings one, so a pause mid-edit isn't a commit.
  update: (id: string, patch: ScriptPatch, opts?: { fromEditor?: boolean }) => Promise<void>
  remove: (id: string) => Promise<void>
  addTag: (id: string, projectRoot: string) => Promise<void>
  removeTag: (id: string, projectRoot: string) => Promise<void>
}

// Scripts are owned by the main process (userData/scripts.json), which the
// vide-scripts MCP server also writes; this store is a mirror refreshed on
// every `scripts:changed`. Script edits schedule a vIDE Sync push; tag
// changes never do (tags are machine-local, see electron/scriptTags.ts).
export const useScriptsStore = create<ScriptsStore>((set, get) => ({
  scripts: [],
  tags: {},
  loaded: false,
  terminalTitles: {},

  setTerminalTitle: (terminalId, title) => set({ terminalTitles: { ...get().terminalTitles, [terminalId]: title } }),

  load: async () => {
    const [scripts, tags] = await Promise.all([window.api.scriptsList(), window.api.scriptsTags()])
    set({ scripts, tags, loaded: true })
  },

  create: async (input) => {
    const script = await window.api.scriptsCreate(input)
    set({ scripts: [...get().scripts, script] })
    notifySettingChanged()
    return script
  },

  update: async (id, patch, opts) => {
    const updated = await window.api.scriptsUpdate(id, patch)
    set({ scripts: get().scripts.map((s) => (s.id === id ? updated : s)) })
    if (opts?.fromEditor) notifyNoteChanged()
    else notifySettingChanged()
  },

  remove: async (id) => {
    await window.api.scriptsDelete(id)
    set({ scripts: get().scripts.filter((s) => s.id !== id) })
    notifySettingChanged()
  },

  addTag: async (id, projectRoot) => {
    set({ tags: await window.api.scriptsTagAdd(id, projectRoot) })
  },

  removeTag: async (id, projectRoot) => {
    set({ tags: await window.api.scriptsTagRemove(id, projectRoot) })
  },
}))
