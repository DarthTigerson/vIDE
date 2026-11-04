import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitStore } from '@/stores/gitStore'

// An edit on disk only touches the working tree, never `.git/*`, so it reaches
// the app as an fs:changed event rather than a git one. The tree's decorations
// are built from the status of every repo in the project, so every repo's
// status needs re-reading. Refreshing only the project root misses all of them
// when the root is a folder of repos rather than a repo itself, and the
// changed file's repo stayed stale until opening the file made it the selected
// repo.
export function refreshRepoStatuses(projectRoot: string): Promise<void[]> {
  const repos = useGitReposStore.getState().repos
  const targets = repos.length > 0 ? repos : [projectRoot]
  return Promise.all(targets.map((repo) => useGitStore.getState().refreshStatus(repo)))
}
