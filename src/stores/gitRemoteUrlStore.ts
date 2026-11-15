import { create } from 'zustand'

// Each repo's web page (GitHub/GitLab/…), read from its git remote by the
// main process (git:remoteWebUrl). Keyed by repo path; null means the repo
// has no usable remote. Missing key = not looked up yet.
interface GitRemoteUrlStore {
  urls: Record<string, string | null>
  refresh: (repo: string) => Promise<string | null>
}

export const useGitRemoteUrlStore = create<GitRemoteUrlStore>((set) => ({
  urls: {},

  refresh: async (repo) => {
    let url: string | null = null
    try {
      url = await window.api.gitRemoteWebUrl(repo)
    } catch {
      url = null
    }
    set((s) => (s.urls[repo] === url ? s : { urls: { ...s.urls, [repo]: url } }))
    return url
  },
}))

// One browser tab per repo, so switching repos keeps each repo's page where
// it was. A short stable hash keeps the id free of path separators.
export function gitRemoteBrowserId(repo: string): string {
  let h = 5381
  for (let i = 0; i < repo.length; i++) h = ((h * 33) ^ repo.charCodeAt(i)) >>> 0
  return `git-remote-${h.toString(36)}`
}
