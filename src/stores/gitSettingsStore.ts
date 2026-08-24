import { create } from 'zustand'

const KEYS = {
  forceSafetyEnabled:        'vide:git:forceSafetyEnabled',
  countdownEnabled:          'vide:git:countdownEnabled',
  countdownSeconds:          'vide:git:countdownSeconds',
  autoContinueOnCountdownEnd:'vide:git:autoContinueOnCountdownEnd',
  listDiffTargetBranches:    'vide:git:listDiffTargetBranches',
  periodicFetchEnabled:      'vide:git:periodicFetchEnabled',
  periodicFetchIntervalMinutes: 'vide:git:periodicFetchIntervalMinutes',
  gitLogAutoShow:            'vide:git:gitLogAutoShow',
  repoScanDepth:             'vide:git:repoScanDepth',
  refsColumnWidth:           'vide:git:refsColumnWidth',
}

export const DEFAULT_REPO_SCAN_DEPTH = 4

// Shared by GitGraphPage and GitBranchDiffPage's refs/pipes column divider.
export const REFS_COLUMN_MIN_WIDTH = 60
export const REFS_COLUMN_MAX_WIDTH = 640
const DEFAULT_REFS_COLUMN_WIDTH = 180

function clampRefsColumnWidth(v: number): number {
  return Math.round(Math.max(REFS_COLUMN_MIN_WIDTH, Math.min(REFS_COLUMN_MAX_WIDTH, v)))
}

export type GitLogAutoShow = 'always' | 'onError'

// Store modules get pulled transitively into plenty of node-environment unit
// tests that have nothing to do with git settings (e.g. anything importing
// gitStore) and never stub out localStorage — guard the read rather than
// throw at module-load time and take an unrelated test file down with it.
function readLocalStorage(key: string): string | null {
  return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
}

function getGitLogAutoShow(key: string, def: GitLogAutoShow): GitLogAutoShow {
  const v = readLocalStorage(key)
  return v === 'always' || v === 'onError' ? v : def
}

function getBool(key: string, def: boolean): boolean {
  const v = readLocalStorage(key)
  return v === null ? def : v === 'true'
}

function getInt(key: string, def: number): number {
  const v = readLocalStorage(key)
  return v === null ? def : parseInt(v, 10)
}

function getBranchMap(key: string): Record<string, string> {
  const v = readLocalStorage(key)
  if (!v) return {}
  try {
    const parsed = JSON.parse(v)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

interface GitSettingsStore {
  forceSafetyEnabled: boolean
  countdownEnabled: boolean
  countdownSeconds: number
  autoContinueOnCountdownEnd: boolean
  listDiffTargetBranches: Record<string, string>
  periodicFetchEnabled: boolean
  periodicFetchIntervalMinutes: number
  gitLogAutoShow: GitLogAutoShow
  repoScanDepth: number
  refsColumnWidth: number
  setForceSafetyEnabled: (v: boolean) => void
  setCountdownEnabled: (v: boolean) => void
  setCountdownSeconds: (v: number) => void
  setAutoContinueOnCountdownEnd: (v: boolean) => void
  getListDiffTargetBranch: (repoPath: string) => string
  setListDiffTargetBranch: (repoPath: string, branch: string) => void
  setPeriodicFetchEnabled: (v: boolean) => void
  setPeriodicFetchIntervalMinutes: (v: number) => void
  setGitLogAutoShow: (v: GitLogAutoShow) => void
  setRepoScanDepth: (v: number) => void
  setRefsColumnWidth: (v: number) => void
}

export const useGitSettingsStore = create<GitSettingsStore>((set, get) => ({
  forceSafetyEnabled:         getBool(KEYS.forceSafetyEnabled, true),
  countdownEnabled:           getBool(KEYS.countdownEnabled, false),
  countdownSeconds:           getInt(KEYS.countdownSeconds, 5),
  autoContinueOnCountdownEnd: getBool(KEYS.autoContinueOnCountdownEnd, false),
  listDiffTargetBranches:     getBranchMap(KEYS.listDiffTargetBranches),
  periodicFetchEnabled:       getBool(KEYS.periodicFetchEnabled, true),
  periodicFetchIntervalMinutes: getInt(KEYS.periodicFetchIntervalMinutes, 5),
  gitLogAutoShow:             getGitLogAutoShow(KEYS.gitLogAutoShow, 'onError'),
  repoScanDepth:              getInt(KEYS.repoScanDepth, DEFAULT_REPO_SCAN_DEPTH),
  refsColumnWidth:            clampRefsColumnWidth(getInt(KEYS.refsColumnWidth, DEFAULT_REFS_COLUMN_WIDTH)),

  setForceSafetyEnabled: (v) => {
    localStorage.setItem(KEYS.forceSafetyEnabled, String(v))
    set({ forceSafetyEnabled: v })
  },
  setCountdownEnabled: (v) => {
    localStorage.setItem(KEYS.countdownEnabled, String(v))
    set({ countdownEnabled: v })
  },
  setCountdownSeconds: (v) => {
    localStorage.setItem(KEYS.countdownSeconds, String(v))
    set({ countdownSeconds: v })
  },
  setAutoContinueOnCountdownEnd: (v) => {
    localStorage.setItem(KEYS.autoContinueOnCountdownEnd, String(v))
    set({ autoContinueOnCountdownEnd: v })
  },
  getListDiffTargetBranch: (repoPath) => get().listDiffTargetBranches[repoPath] ?? '',
  setListDiffTargetBranch: (repoPath, branch) => {
    const next = { ...get().listDiffTargetBranches }
    if (branch) {
      next[repoPath] = branch
    } else {
      delete next[repoPath]
    }
    localStorage.setItem(KEYS.listDiffTargetBranches, JSON.stringify(next))
    set({ listDiffTargetBranches: next })
  },
  setPeriodicFetchEnabled: (v) => {
    localStorage.setItem(KEYS.periodicFetchEnabled, String(v))
    set({ periodicFetchEnabled: v })
  },
  setPeriodicFetchIntervalMinutes: (v) => {
    const clamped = Math.max(1, Math.min(120, v))
    localStorage.setItem(KEYS.periodicFetchIntervalMinutes, String(clamped))
    set({ periodicFetchIntervalMinutes: clamped })
  },
  setGitLogAutoShow: (v) => {
    localStorage.setItem(KEYS.gitLogAutoShow, v)
    set({ gitLogAutoShow: v })
  },
  setRepoScanDepth: (v) => {
    const clamped = Math.max(1, Math.min(10, Math.round(v)))
    localStorage.setItem(KEYS.repoScanDepth, String(clamped))
    set({ repoScanDepth: clamped })
  },
  setRefsColumnWidth: (v) => {
    const clamped = clampRefsColumnWidth(v)
    localStorage.setItem(KEYS.refsColumnWidth, String(clamped))
    set({ refsColumnWidth: clamped })
  },
}))
