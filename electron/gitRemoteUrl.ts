// Turns a git remote URL (as printed by `git remote get-url`) into the web
// page of that repo, for the Git panel's "Open GitHub/GitLab/…" launcher.
// Pure so it can be unit-tested without a repo.
//
// Handles the shapes git itself accepts:
//   https://github.com/owner/repo.git           -> https://github.com/owner/repo
//   https://user:token@github.com/owner/repo    -> https://github.com/owner/repo (credentials dropped)
//   git@github.com:owner/repo.git               -> https://github.com/owner/repo (scp-like SSH)
//   ssh://git@host:2222/owner/repo.git          -> https://host/owner/repo (SSH port dropped)
//   git://host/owner/repo.git                   -> https://host/owner/repo
// Local paths and file:// remotes have no web page and return null.
export function remoteToWebUrl(remote: string): string | null {
  const raw = remote.trim()
  if (!raw) return null

  let host: string
  let path: string

  const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/)(.+)$/.exec(raw)
  if (!raw.includes('://') && scp) {
    host = scp[1]
    path = scp[2]
  } else {
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      return null
    }
    const scheme = url.protocol.replace(/:$/, '').toLowerCase()
    if (!['http', 'https', 'ssh', 'git', 'git+ssh', 'ssh+git'].includes(scheme)) return null
    if (!url.hostname) return null
    // http(s) keeps a non-default port (self-hosted web UIs often run on one);
    // SSH/git ports belong to the transport, not the web page.
    host = scheme === 'http' || scheme === 'https' ? url.host : url.hostname
    path = decodeURIComponent(url.pathname)
  }

  const cleanPath = path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/i, '')
  if (!cleanPath || !host) return null
  return `https://${host}/${cleanPath}`
}

// Which remote the launcher should open: the current branch's upstream
// remote if it has one, else `origin`, else the first remote listed.
export function pickRemoteName(remotes: string[], upstreamRemote: string | null): string | null {
  if (upstreamRemote && remotes.includes(upstreamRemote)) return upstreamRemote
  if (remotes.includes('origin')) return 'origin'
  return remotes[0] ?? null
}
