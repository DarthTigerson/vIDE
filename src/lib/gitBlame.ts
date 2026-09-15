import type { GitFileBlame } from '@/types/index'

export type { GitFileBlame, GitBlameLine } from '@/types/index'

// In-memory, window-lifetime cache for per-file blame, keyed by repo root +
// repo-relative path. `git blame` on a large file isn't free, and re-showing
// the same file's blame is the common case (switching back and forth
// between open tabs) - this cache means that costs one `git blame` shell-out
// per (repo, file) between git-changed events, not one per tab switch.
//
// Entries are dropped outright (not diffed against a freshly-fetched HEAD
// hash) whenever invalidateRepoBlame() is called for their repo - the
// intended caller is the same onGitChanged listener Editor.tsx's gutter
// decorations already use to learn HEAD may have moved. Checking whether
// HEAD *actually* moved would itself require a git call, so there's no
// cheaper way to stay HEAD-accurate than re-fetching lazily on that same
// signal; getFileBlame's result also carries the resolved HEAD commit
// (electron/git.ts's getFileBlame) for any caller that wants to double-check
// freshness explicitly.
const cache = new Map<string, GitFileBlame>()
const inflight = new Map<string, Promise<GitFileBlame>>()

// \0 is used as the repoRoot/relPath delimiter rather than a printable
// character (e.g. a space) since it can never legitimately appear in either
// half - a plain separator could otherwise make one repo's prefix collide
// with a different repo whose path happens to start with it.
function cacheKey(repoRoot: string, relPath: string): string {
  return `${repoRoot}\0${relPath}`
}

// Drops every cached/in-flight blame for one repo. Cheap - at most as many
// entries as this window has ever blamed a file for in that repo, never the
// whole cache across every open project.
export function invalidateRepoBlame(repoRoot: string): void {
  const prefix = `${repoRoot}\0`
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(prefix)) inflight.delete(key)
  }
}

// Clears the entire cache - exposed mainly for tests; the app itself only
// ever needs the more targeted invalidateRepoBlame above.
export function clearBlameCache(): void {
  cache.clear()
  inflight.clear()
}

// Fetches (and caches) blame for one file. Always one `git blame` IPC call
// for the whole file - never per-line - and never re-issued for a (repo,
// file) pair that's still cached unless invalidateRepoBlame() cleared it (a
// real git-state change) or `force` is passed (an explicit refresh, e.g. the
// onGitChanged path in the Editor.tsx integration). Concurrent callers for
// the same not-yet-cached (repo, file) share one in-flight request instead
// of each starting their own `git blame` shell-out.
export function getFileBlame(
  repoRoot: string,
  relPath: string,
  opts: { force?: boolean } = {}
): Promise<GitFileBlame> {
  const key = cacheKey(repoRoot, relPath)

  if (!opts.force) {
    const cached = cache.get(key)
    if (cached) return Promise.resolve(cached)
    const pending = inflight.get(key)
    if (pending) return pending
  }

  const request = window.api.gitBlame(repoRoot, relPath).then((result) => {
    cache.set(key, result)
    inflight.delete(key)
    return result
  })
  inflight.set(key, request)
  return request
}
