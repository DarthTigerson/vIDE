export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

export interface Tab {
  path: string
  content: string
  dirty: boolean
  missing?: boolean
}

export interface GitFileEntry {
  path: string
  status: 'M' | 'A' | 'D' | 'R' | '?'
}

export interface GitStatus {
  staged: GitFileEntry[]
  unstaged: GitFileEntry[]
}

export type GitCommitResult = { ok: true } | { ok: false; error: string }

export interface GitDiffContent {
  original: string
  modified: string
}

export interface GitAheadBehind {
  ahead: number
  behind: number
}

export type GitCommandAction =
  'fetch' | 'pull' | 'push' | 'forcePush' | 'forcePushLease' | 'checkout' | 'publishBranch' |
  'undoLastCommit' | 'hardReset'

export interface GitCheckoutPayload {
  ref: string
  create: boolean
  track?: string
}

// git push -u origin <branch> — sets up remote tracking for a branch that
// has never been pushed before, so a plain `push` afterward has an upstream
// to push to.
export interface GitPublishBranchPayload {
  branch: string
}

// git reset --hard <ref> — ref is whatever the user picked or typed in the
// reset palette: a branch name, tag, or commit hash all work unmodified
// since git resolves any of those as a revision.
export interface GitHardResetPayload {
  ref: string
}

export type GitCommandPayload = GitCheckoutPayload | GitPublishBranchPayload | GitHardResetPayload

export interface GitBranchList {
  current: string | null
  local: string[]
  remote: string[]
}

export interface GitCommit {
  hash: string
  parents: string[]
  subject: string
  author: string
  date: string
  refs: string[]
}

export interface GitBranchDiff {
  source: string
  target: string
  commits: GitCommit[]
}

export interface SearchMatch {
  path: string
  line: number
  col: number
  text: string
}
