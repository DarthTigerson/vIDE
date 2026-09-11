import { useGitReposStore } from '@/stores/gitReposStore'
import { RepoSection } from './RepoSection'

export function GitPanel() {
  const repos = useGitReposStore((s) => s.repos)

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
      <div className="h-9 px-3 border-b border-border shrink-0 flex items-center">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">
          Git Panel
        </span>
      </div>

      {repos.map((repo) => <RepoSection key={repo} repo={repo} />)}
    </div>
  )
}
