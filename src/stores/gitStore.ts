import { create } from 'zustand'
import type { GitStatus, GitAheadBehind, GitCommandAction, GitCommandPayload, GitCheckoutPayload } from '@/types/index'
import { useEditorStore } from './editorStore'
import { useGitLogStore } from './gitLogStore'
import { useGitGraphStore } from './gitGraphStore'
import { useGitBranchStore } from './gitBranchStore'
import { useGitSettingsStore } from './gitSettingsStore'
import { GIT_GRAPH_TAB_PATH, GIT_LOG_TAB_PATH } from '@/components/Settings/paths'

function revealGitLogTab() {
  useEditorStore.getState().openTab({ path: GIT_LOG_TAB_PATH, content: '', dirty: false })
}

export interface RepoGitState {
  branch: string | null
  aheadBehind: GitAheadBehind | null
  status: GitStatus
  ignoredPaths: string[]
  commitMessage: string
  commitError: string | null
  commandStatus: 'idle' | 'running'
  // Bumped (never reset) each time a git command exits non-zero or throws —
  // GitActivityBar watches for it increasing to trigger a one-shot error
  // flash, independent of the gitLogAutoShow setting.
  commandError: number
  silentFetchInFlight: boolean
}

export const emptyRepoGitState: RepoGitState = {
  branch: null,
  aheadBehind: null,
  status: { staged: [], unstaged: [] },
  ignoredPaths: [],
  commitMessage: '',
  commitError: null,
  commandStatus: 'idle',
  commandError: 0,
  silentFetchInFlight: false,
}

interface GitStore {
  repos: Record<string, RepoGitState>
  fetchSilent: (cwd: string) => Promise<void>
  refresh: (cwd: string | null) => Promise<void>
  refreshStatus: (cwd: string | null) => Promise<void>
  stage: (cwd: string, path: string) => Promise<void>
  unstage: (cwd: string, path: string) => Promise<void>
  stageAll: (cwd: string) => Promise<void>
  unstageAll: (cwd: string) => Promise<void>
  discard: (cwd: string, path: string) => Promise<void>
  discardAll: (cwd: string) => Promise<void>
  setCommitMessage: (cwd: string, message: string) => void
  commit: (cwd: string, noVerify?: boolean) => Promise<void>
  fetch: (cwd: string) => Promise<void>
  pull: (cwd: string) => Promise<void>
  push: (cwd: string) => Promise<void>
  forcePush: (cwd: string) => Promise<void>
  forcePushLease: (cwd: string) => Promise<void>
  checkout: (cwd: string, payload: GitCheckoutPayload) => Promise<void>
  publishBranch: (cwd: string, branch: string) => Promise<void>
  undoLastCommit: (cwd: string) => Promise<void>
  hardReset: (cwd: string, ref: string) => Promise<void>
}

function describeCommand(action: GitCommandAction, payload?: GitCommandPayload): string {
  if (action === 'forcePush') return 'push --force'
  if (action === 'forcePushLease') return 'push --force-with-lease'
  if (action === 'checkout' && payload && 'ref' in payload) {
    if (payload.track) return `checkout -b ${payload.ref} --track ${payload.track}`
    if (payload.create) return `checkout -b ${payload.ref}`
    return `checkout ${payload.ref}`
  }
  if (action === 'publishBranch' && payload && 'branch' in payload) {
    return `push --set-upstream origin ${payload.branch}`
  }
  if (action === 'undoLastCommit') return 'reset --soft HEAD~1'
  if (action === 'hardReset' && payload && 'ref' in payload) {
    return `reset --hard ${payload.ref}`
  }
  return action
}

export const useGitStore = create<GitStore>((set, get) => {
  const stateFor = (cwd: string): RepoGitState => get().repos[cwd] ?? emptyRepoGitState

  const setRepo = (cwd: string, patch: Partial<RepoGitState>) =>
    set((s) => ({ repos: { ...s.repos, [cwd]: { ...(s.repos[cwd] ?? emptyRepoGitState), ...patch } } }))

  const refreshGraphIfOpen = async (cwd: string) => {
    const graphOpen = useEditorStore.getState().tabs.some((tab) => tab.path === GIT_GRAPH_TAB_PATH)
    if (graphOpen) await useGitGraphStore.getState().load(cwd)
  }

  const runCommand = async (cwd: string, action: GitCommandAction, payload?: GitCommandPayload) => {
    if (stateFor(cwd).commandStatus === 'running') return
    const id = crypto.randomUUID()
    const autoShow = useGitSettingsStore.getState().gitLogAutoShow

    if (autoShow === 'always') revealGitLogTab()
    useGitLogStore.getState().append(cwd, `\n> git ${describeCommand(action, payload)}\n`)

    setRepo(cwd, { commandStatus: 'running' })

    const cleanupData = window.api.onGitLogData((evtId, data) => {
      if (evtId !== id) return
      useGitLogStore.getState().append(cwd, data)
    })
    const cleanupExit = window.api.onGitLogExit((evtId, code) => {
      if (evtId !== id) return
      cleanupData()
      cleanupExit()
      setRepo(cwd, {
        commandStatus: 'idle',
        ...(code !== 0 ? { commandError: stateFor(cwd).commandError + 1 } : {}),
      })
      if (code === 0) {
        get().refresh(cwd)
        if (action === 'checkout') {
          useGitBranchStore.getState().load(cwd)
          get().fetchSilent(cwd)
        }
      } else if (autoShow === 'onError') {
        revealGitLogTab()
      }
    })

    try {
      if (payload !== undefined) {
        await window.api.gitRunCommand(id, cwd, action, payload)
      } else {
        await window.api.gitRunCommand(id, cwd, action)
      }
    } catch (err) {
      cleanupData()
      cleanupExit()
      useGitLogStore.getState().append(cwd, `\nError: ${err instanceof Error ? err.message : String(err)}\n`)
      setRepo(cwd, { commandStatus: 'idle', commandError: stateFor(cwd).commandError + 1 })
      if (autoShow === 'onError') revealGitLogTab()
    }
  }

  return {
  repos: {},

  // Best-effort background fetch — periodic timer, repo open, post-checkout.
  // Deliberately bypasses runCommand: it must not open/spam the Git Log tab
  // the way the manual Fetch button does, and must not flip commandStatus
  // (which disables the Fetch/Pull/Push menu and shows its own "running"
  // dot next to the branch name). silentFetchInFlight exists purely so the
  // footer git icon can flash for this too, same as any visible command.
  fetchSilent: async (cwd) => {
    const state = stateFor(cwd)
    if (state.commandStatus === 'running' || state.silentFetchInFlight) return
    setRepo(cwd, { silentFetchInFlight: true })
    try {
      const ok = await window.api.gitFetchSilent(cwd)
      if (ok) await get().refresh(cwd)
    } finally {
      setRepo(cwd, { silentFetchInFlight: false })
    }
  },

  refresh: async (cwd) => {
    if (!cwd) return
    const [branch, aheadBehind] = await Promise.all([
      window.api.gitBranch(cwd),
      window.api.gitAheadBehind(cwd),
    ])
    setRepo(cwd, { branch, aheadBehind })
    await get().refreshStatus(cwd)
  },

  refreshStatus: async (cwd) => {
    if (!cwd) return
    const [status, ignoredPaths] = await Promise.all([
      window.api.gitStatus(cwd),
      window.api.gitListIgnored(cwd),
    ])
    setRepo(cwd, { status, ignoredPaths })
  },

  stage: async (cwd, path) => {
    try {
      await window.api.gitStage(cwd, [path])
    } catch (err) {
      console.error('git stage failed', err)
    } finally {
      await get().refreshStatus(cwd)
    }
  },

  unstage: async (cwd, path) => {
    try {
      await window.api.gitUnstage(cwd, [path])
    } catch (err) {
      console.error('git unstage failed', err)
    } finally {
      await get().refreshStatus(cwd)
    }
  },

  stageAll: async (cwd) => {
    try {
      await window.api.gitStageAll(cwd)
    } catch (err) {
      console.error('git stageAll failed', err)
    } finally {
      await get().refreshStatus(cwd)
    }
  },

  unstageAll: async (cwd) => {
    try {
      await window.api.gitUnstageAll(cwd)
    } catch (err) {
      console.error('git unstageAll failed', err)
    } finally {
      await get().refreshStatus(cwd)
    }
  },

  discard: async (cwd, path) => {
    try {
      await window.api.gitDiscard(cwd, path)
    } catch (err) {
      console.error('git discard failed', err)
    } finally {
      await get().refreshStatus(cwd)
    }
  },

  discardAll: async (cwd) => {
    try {
      await window.api.gitDiscardAll(cwd)
    } catch (err) {
      console.error('git discardAll failed', err)
    } finally {
      await get().refreshStatus(cwd)
    }
  },

  setCommitMessage: (cwd, message) => setRepo(cwd, { commitMessage: message, commitError: null }),

  commit: async (cwd, noVerify) => {
    const { commitMessage } = stateFor(cwd)
    setRepo(cwd, { commandStatus: 'running' })
    const result = await window.api.gitCommit(cwd, commitMessage, noVerify)
    if (result.ok) {
      setRepo(cwd, { commandStatus: 'idle', commitMessage: '', commitError: null })
      await get().refresh(cwd)
      await refreshGraphIfOpen(cwd)
    } else {
      setRepo(cwd, { commandStatus: 'idle', commitError: result.error, commandError: stateFor(cwd).commandError + 1 })
    }
  },

  fetch:          (cwd) => runCommand(cwd, 'fetch'),
  pull:           (cwd) => runCommand(cwd, 'pull'),
  push:           (cwd) => runCommand(cwd, 'push'),
  forcePush:      (cwd) => runCommand(cwd, 'forcePush'),
  forcePushLease: (cwd) => runCommand(cwd, 'forcePushLease'),
  checkout:       (cwd, payload) => runCommand(cwd, 'checkout', payload),
  publishBranch:  (cwd, branch) => runCommand(cwd, 'publishBranch', { branch }),
  undoLastCommit: (cwd) => runCommand(cwd, 'undoLastCommit'),
  hardReset:      (cwd, ref) => runCommand(cwd, 'hardReset', { ref }),
  }
})

// Selector helper for components: reads one repo's slice, defaulting to
// emptyRepoGitState (a stable module-level reference, safe to return
// directly) when cwd is null or that repo hasn't loaded yet.
export function useRepoGitState(cwd: string | null): RepoGitState {
  return useGitStore((s) => (cwd ? s.repos[cwd] ?? emptyRepoGitState : emptyRepoGitState))
}
