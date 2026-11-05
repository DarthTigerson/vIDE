import { existsSync, readFileSync, statSync } from 'fs'
import { execFile } from 'child_process'
import { join } from 'path'
import type { LocalRepo } from './masker'
import { isUnder } from './store'

// Finds company repos inside a workspace. Sources, all optional:
// - graphify: graphify-out/manifest.json lists every indexed file, so its
//   folders are checked for a .git without walking the disk
// - ripgrep (bundled with vIDE): finds .git/config files, catches repos
//   graphify has not indexed yet
// A folder counts only when its git remote is under the company root, so
// third-party packages in the index are ignored.

export interface DiscoverResult {
  repos: LocalRepo[]
  graphify: { found: boolean; repos: number; builtAt: number | null }
  ripgrep: { repos: number }
}

const MAX_MANIFEST_BYTES = 64 * 1024 * 1024
const MAX_DEPTH = 8

// "git@host:group/repo.git", "https://host/group/repo", "ssh://git@host:22/group/repo"
export function remotePath(url: string): string | null {
  const u = url.trim()
  let path: string | null = null
  const scp = /^[\w.-]+@[\w.-]+:(?!\/\/)(.+)$/.exec(u)
  if (scp) path = scp[1]
  else {
    try {
      path = new URL(u).pathname
    } catch {
      return null
    }
  }
  path = path.replace(/^\/+/, '').replace(/\.git$/, '').replace(/\/+$/, '')
  return path || null
}

export function originUrl(gitConfig: string): string | null {
  let section = ''
  let first: string | null = null
  for (const line of gitConfig.split('\n')) {
    const head = /^\s*\[(.+)\]\s*$/.exec(line)
    if (head) {
      section = head[1]
      continue
    }
    const kv = /^\s*url\s*=\s*(.+?)\s*$/.exec(line)
    if (kv && section.startsWith('remote ')) {
      if (section === 'remote "origin"') return kv[1]
      first ??= kv[1]
    }
  }
  return first
}

function repoAt(ws: string, rel: string, root: string): LocalRepo | null {
  const cfg = join(ws, rel, '.git', 'config')
  if (!existsSync(cfg)) return null
  try {
    const url = originUrl(readFileSync(cfg, 'utf8'))
    const remote = url ? remotePath(url) : null
    return remote && isUnder(root, remote) && remote !== root ? { rel, remote } : null
  } catch {
    return null
  }
}

export function fromGraphify(ws: string, root: string): { found: boolean; builtAt: number | null; repos: LocalRepo[] } {
  const file = join(ws, 'graphify-out', 'manifest.json')
  if (!existsSync(file)) return { found: false, builtAt: null, repos: [] }
  try {
    const st = statSync(file)
    if (st.size > MAX_MANIFEST_BYTES) return { found: true, builtAt: st.mtimeMs, repos: [] }
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    const dirs = new Set<string>()
    for (const key of Object.keys(manifest)) {
      const parts = key.split('/')
      for (let i = 1; i < parts.length && i <= MAX_DEPTH; i++) dirs.add(parts.slice(0, i).join('/'))
    }
    const repos = [...dirs].flatMap((d) => repoAt(ws, d, root) ?? [])
    return { found: true, builtAt: st.mtimeMs, repos }
  } catch {
    return { found: true, builtAt: null, repos: [] }
  }
}

export function fromRipgrep(ws: string, root: string, rgPath: string): Promise<LocalRepo[]> {
  const args = [
    '--files', '--hidden', '--no-ignore', '--no-messages', '--max-depth', String(MAX_DEPTH + 2),
    '-g', '**/.git/config',
    '-g', '!**/node_modules/**',
    '-g', '!**/.git/{objects,refs,logs,hooks,modules,lfs}/**',
  ]
  return new Promise((resolve) => {
    execFile(rgPath, args, { cwd: ws, timeout: 20_000, maxBuffer: 16 * 1024 * 1024 }, (_err, stdout) => {
      const repos = String(stdout ?? '')
        .split('\n')
        .map((l) => l.replace(/^\.\//, '').trim())
        .filter((l) => l.endsWith('.git/config'))
        .map((l) => l.slice(0, -'/.git/config'.length))
        .filter((rel) => rel !== '' && !rel.startsWith('.git'))
        .flatMap((rel) => repoAt(ws, rel, root) ?? [])
      resolve(repos)
    })
  })
}

export async function discoverRepos(ws: string, root: string, rgPath: string | null): Promise<DiscoverResult> {
  const g = fromGraphify(ws, root)
  const rg = rgPath ? await fromRipgrep(ws, root, rgPath) : []
  const byRel = new Map<string, LocalRepo>()
  for (const r of [...g.repos, ...rg]) byRel.set(r.rel, r)
  return {
    repos: [...byRel.values()],
    graphify: { found: g.found, repos: g.repos.length, builtAt: g.builtAt },
    ripgrep: { repos: rg.length },
  }
}
