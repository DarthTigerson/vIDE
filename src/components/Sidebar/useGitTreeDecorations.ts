import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGitStore } from '@/stores/gitStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import {
  buildFileGitDecorations,
  buildFolderGitAggregates,
  type FileGitDecorationMap,
  type FolderGitAggregateMap,
} from '@/lib/gitTreeStatus'

export interface GitTreeDecorations {
  files: FileGitDecorationMap
  folders: FolderGitAggregateMap
}

// Feeds FileTree's per-row decoration off of gitStore/gitReposStore without
// recomputing on every render, keystroke, or expand/collapse: it subscribes
// to gitStore with `useShallow` over just the `status` slice of each of
// this project's repos (never the whole per-repo state, which also holds
// commitMessage/commandStatus and changes on every commit-message
// keystroke or command run) — so the selector's output is only considered
// "changed" when a repo's `status` object itself is replaced, i.e. an
// actual stage/unstage/commit/refresh (including the onGitChanged
// watcher-driven one in App.tsx). The two useMemo calls then only re-run
// when that status data — or the discovered repo list itself — actually
// changes, not on unrelated re-renders of this hook's caller.
export function useGitTreeDecorations(): GitTreeDecorations {
  const repoRoots = useGitReposStore((s) => s.repos)
  const statuses = useGitStore(useShallow((s) => repoRoots.map((repo) => s.repos[repo]?.status)))

  const files = useMemo(() => buildFileGitDecorations(repoRoots, statuses), [repoRoots, statuses])
  const folders = useMemo(() => buildFolderGitAggregates(files), [files])

  return { files, folders }
}
