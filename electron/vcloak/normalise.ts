import type { LocalRepo } from './masker'
import { remotePath } from './sources'
import { isUnder } from './store'
import { guessHost } from './guessHost'
import type { VcloakRoot } from './types'

export { guessHost }

// Turns what people paste into the plain group path vCloak stores:
// links, git remotes, encoded slashes, local folders, missing root.

export interface KnownWorkspace {
  root: string
  repos: LocalRepo[]
}

export type Normalised = { ok: true; value: string } | { ok: false; error: string }

const trimSlashes = (s: string) => s.trim().replace(/^\/+|\/+$/g, '')

// "https://host/group/sub/repo.git/-/tree/main" -> "group/sub/repo"
function fromLink(s: string): string | null {
  if (!/^(?:https?:\/\/|ssh:\/\/|git@[\w.-]+:)/i.test(s)) return null
  let path = remotePath(s)
  if (path === null) return null
  try { path = decodeURIComponent(path) } catch { /* keep as is */ }
  const cut = path.search(/\/-(?:\/|$)/)
  if (cut >= 0) path = path.slice(0, cut)
  return trimSlashes(path.replace(/\.git$/, ''))
}

function fromLocal(abs: string, known: KnownWorkspace[]): Normalised {
  const clean = abs.replace(/\/+$/, '')
  for (const w of known) {
    const root = w.root.replace(/\/+$/, '')
    if (!clean.startsWith(root + '/')) continue
    const rel = clean.slice(root.length + 1).split('/').filter(Boolean)
    for (let i = rel.length; i > 0; i--) {
      const rp = rel.slice(0, i).join('/')
      const repo = w.repos.find((r) => r.rel.split('/').filter(Boolean).join('/') === rp)
      if (repo) return { ok: true, value: [repo.remote, ...rel.slice(i)].join('/') }
    }
  }
  return { ok: false, error: `No git repository found at ${abs}. To hide a local folder, add it under Hidden local folders.` }
}

// One repository path (rule real/decoy, exception) typed or pasted by a person.
// roots: the configured company roots. Without a root prefix the only root is
// added; with several roots the person has to write it.
export function normaliseRepoInput(input: string, roots: VcloakRoot[], knownLocal: KnownWorkspace[] = [], homeDir = ''): Normalised {
  let s = input.trim().replace(/%2F/gi, '/')
  if (s === '') return { ok: true, value: '' }
  const link = fromLink(s)
  if (link !== null) s = link
  else if (s.startsWith('~/') || s === '~') {
    s = homeDir ? homeDir.replace(/\/+$/, '') + s.slice(1) : s
    if (s.startsWith('~')) return { ok: false, error: `No git repository found at ${input.trim()}. To hide a local folder, add it under Hidden local folders.` }
  }
  const paths = roots.map((r) => trimSlashes(r.path)).filter(Boolean)
  const under = (p: string) => paths.some((r) => isUnder(r, p))
  // "/acme-corp/group/repo" is a group path with a stray slash, not a folder
  const strayGroup = under(trimSlashes(s)) && s.startsWith('/') && !knownLocal.some((w) => s.startsWith(w.root.replace(/\/+$/, '') + '/'))
  if (s.startsWith('/') && !strayGroup) {
    const local = fromLocal(s, knownLocal)
    if (!local.ok) return local
    s = local.value
  }
  s = trimSlashes(s)
  if (paths.length > 0 && !under(s)) {
    if (paths.length > 1) return { ok: false, error: `Write the full path including its root, for example ${paths[0]}/${s}` }
    s = `${paths[0]}/${s}`
  }
  // GitHub and similar hosts: a repository is owner/repo, the rest is a file route
  const root = roots.find((r) => trimSlashes(r.path) !== '' && isUnder(trimSlashes(r.path), s))
  if (root && root.host !== 'gitlab') {
    const rootLen = trimSlashes(root.path).split('/').length
    s = s.split('/').slice(0, rootLen + 1).join('/')
  }
  return { ok: true, value: s }
}

// The company root box: a pasted group or organisation link becomes its path
export function normaliseRoot(input: string): string {
  const s = input.trim().replace(/%2F/gi, '/')
  const link = fromLink(s)
  const path = trimSlashes(link ?? s)
  // A GitHub link may point at a repository: the root is the owner only
  return guessHost(s) === 'github' ? path.split('/')[0] : path
}
