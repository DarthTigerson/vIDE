import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitStore } from '@/stores/gitStore'

// An edit on disk only touches the working tree, never `.git/*`, so it reaches
// the app as an fs:changed event rather than a git one. Refreshing only the
// project root misses every repo when the root is a folder of repos rather
// than a repo itself, and the changed file's repo stayed stale until opening
// the file made it the selected repo. Only the repos that own a changed path
// are refreshed: a folder of dozens of repos would otherwise run a git status
// per repo on every burst of edits.
export function refreshRepoStatuses(projectRoot: string, changedPaths?: string[]): Promise<void[]> {
  const repos = useGitReposStore.getState().repos
  const targets = repos.length === 0 ? [projectRoot] : changedPaths ? owningRepos(repos, changedPaths) : repos
  return Promise.all(targets.map((repo) => useGitStore.getState().refreshStatus(repo)))
}

// The innermost repo containing each path (repos can nest).
export function owningRepos(repos: string[], paths: string[]): string[] {
  const owners = new Set<string>()
  for (const path of paths) {
    let best: string | undefined
    for (const repo of repos) {
      if ((path === repo || path.startsWith(repo + '/')) && (!best || repo.length > best.length)) best = repo
    }
    if (best) owners.add(best)
  }
  return Array.from(owners)
}
