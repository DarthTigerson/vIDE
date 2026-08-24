import { create } from 'zustand'

const URL_KEY = 'vide:gitRemote:externalUrl'
const PROJECT_URLS_KEY = 'vide:gitRemote:projectUrls'
const CLOSE_SIDE_PANEL_KEY = 'vide:gitRemote:closeSidePanel'

function getBool(key: string, def: boolean): boolean {
  const value = localStorage.getItem(key)
  return value === null ? def : value === 'true'
}

function getUrlMap(key: string): Record<string, string> {
  const v = localStorage.getItem(key)
  if (!v) return {}
  try {
    const parsed = JSON.parse(v)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

interface GitRemoteSettingsStore {
  externalUrl: string
  setExternalUrl: (value: string) => void
  // Per-project override of externalUrl, keyed by projectRoot — for repos
  // whose remote page lives somewhere other than the default (e.g. a
  // personal fork, or a project on a different Git host than most others).
  projectUrls: Record<string, string>
  getEffectiveUrl: (projectRoot: string | null) => string
  setProjectUrl: (projectRoot: string, value: string) => void
  closeSidePanelOnOpen: boolean
  setCloseSidePanelOnOpen: (value: boolean) => void
}

export const useGitRemoteSettingsStore = create<GitRemoteSettingsStore>((set, get) => ({
  externalUrl: localStorage.getItem(URL_KEY) || '',

  setExternalUrl: (value) => {
    localStorage.setItem(URL_KEY, value)
    set({ externalUrl: value })
  },

  projectUrls: getUrlMap(PROJECT_URLS_KEY),

  getEffectiveUrl: (projectRoot) => {
    const { projectUrls, externalUrl } = get()
    if (projectRoot && projectUrls[projectRoot]) return projectUrls[projectRoot]
    return externalUrl
  },

  setProjectUrl: (projectRoot, value) => {
    const next = { ...get().projectUrls }
    if (value) {
      next[projectRoot] = value
    } else {
      delete next[projectRoot]
    }
    localStorage.setItem(PROJECT_URLS_KEY, JSON.stringify(next))
    set({ projectUrls: next })
  },

  closeSidePanelOnOpen: getBool(CLOSE_SIDE_PANEL_KEY, false),

  setCloseSidePanelOnOpen: (value) => {
    localStorage.setItem(CLOSE_SIDE_PANEL_KEY, String(value))
    set({ closeSidePanelOnOpen: value })
  },
}))
