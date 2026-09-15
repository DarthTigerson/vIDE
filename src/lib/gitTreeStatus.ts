import type { GitFileEntry, GitStatus } from '@/types/index'

// A single file's tree decoration: the color the Git panel already uses for
// this status code, plus the single letter shown as the tree's badge.
export interface FileGitDecoration {
  /** Raw git status code this decoration was derived from. */
  code: GitFileEntry['status']
  /** Single-letter badge shown in the tree row. Mirrors `code`, except
   *  untracked ('?') displays as 'U' (M/A/U/D is the badge set this
   *  feature was asked for — VS Code Explorer's own convention). */
  letter: string
  /** Tailwind text-color class for this status. */
  textClass: string
}

// Copied from src/components/Git/FileRow.tsx's STATUS_COLOR map (that file
// is outside this feature's read-write scope) so the tree's colors are
// identical to the Git panel's own per-file status rows rather than a new
// palette invented for this feature.
const STATUS_COLOR: Record<GitFileEntry['status'], string> = {
  M: 'text-amber-400',
  A: 'text-green-400',
  D: 'text-red-400',
  R: 'text-blue-400',
  '?': 'text-fg-subtle',
}

function toDecoration(code: GitFileEntry['status']): FileGitDecoration {
  return { code, letter: code === '?' ? 'U' : code, textClass: STATUS_COLOR[code] }
}

export type FileGitDecorationMap = Map<string, FileGitDecoration>
export type FolderGitAggregateMap = Map<string, FileGitDecoration>

// Builds one absolute-path -> decoration entry per changed file, across
// every repo this project actually discovered. `repoRoots`/`statuses` are
// paired by index (rather than a single Record<repo, GitStatus>) so a
// caller can select just the `status` slice of each repo's state it
// actually needs — see useGitTreeDecorations, which relies on this to keep
// its store subscription from reacting to unrelated per-repo state
// (commit-message text, running-command flag, etc.).
//
// Each repo's status.staged/unstaged paths are repo-relative (straight off
// `git status --porcelain`), so they're joined with THAT repo's own root
// here and never cross-applied to another repo's files — the same scoping
// care VIDE-87 called out for the activity-bar Git badge (see git log),
// applied here per-file instead of per-repo-count.
export function buildFileGitDecorations(
  repoRoots: string[],
  statuses: (GitStatus | undefined)[],
): FileGitDecorationMap {
  const files: FileGitDecorationMap = new Map()
  repoRoots.forEach((repo, i) => {
    const status = statuses[i]
    if (!status) return
    for (const entry of status.staged) files.set(`${repo}/${entry.path}`, toDecoration(entry.status))
    // Applied after staged so a file edited further after being staged
    // (e.g. porcelain "AM") ends up showing its current working-tree
    // status — the more immediately relevant of the two for a single
    // at-a-glance tree badge.
    for (const entry of status.unstaged) files.set(`${repo}/${entry.path}`, toDecoration(entry.status))
  })
  return files
}

// Priority order for a folder that contains more than one kind of change,
// lowest to highest — modified wins as the most "in progress" signal,
// then deleted, then added/renamed, with untracked last since it's usually
// the least urgent (often just scratch/generated files not yet tracked).
const AGGREGATE_PRIORITY: GitFileEntry['status'][] = ['?', 'R', 'A', 'D', 'M']

function isHigherPriority(a: GitFileEntry['status'], b: GitFileEntry['status']): boolean {
  return AGGREGATE_PRIORITY.indexOf(a) > AGGREGATE_PRIORITY.indexOf(b)
}

function parentDir(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx <= 0 ? '' : path.slice(0, idx)
}

// Derives folders' aggregate decoration incrementally from the per-file map
// above, rather than a fresh recursive walk of the whole tree: for each
// changed file, climbs its ancestor chain once, keeping the
// highest-priority decoration seen at each folder. Cost is proportional to
// (changed files x average depth), not the size of the whole project tree,
// so it stays cheap regardless of how large the tree is as long as the
// number of actually-changed files is small (the common case).
export function buildFolderGitAggregates(files: FileGitDecorationMap): FolderGitAggregateMap {
  const folders: FolderGitAggregateMap = new Map()
  for (const [path, decoration] of files) {
    let dir = parentDir(path)
    while (dir) {
      const existing = folders.get(dir)
      if (!existing || isHigherPriority(decoration.code, existing.code)) {
        folders.set(dir, decoration)
      }
      dir = parentDir(dir)
    }
  }
  return folders
}
