import type { LocalRepo } from './masker'
import { remotePath } from './sources'

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

// One repository path (rule real/decoy, exception) typed or pasted by a person
export function normaliseRepoInput(input: string, root: string, knownLocal: KnownWorkspace[] = [], homeDir = ''): Normalised {
  let s = input.trim().replace(/%2F/gi, '/')
  if (s === '') return { ok: true, value: '' }
  const link = fromLink(s)
  if (link !== null) s = link
  else if (s.startsWith('~/') || s === '~') {
    s = homeDir ? homeDir.replace(/\/+$/, '') + s.slice(1) : s
    if (s.startsWith('~')) return { ok: false, error: `No git repository found at ${input.trim()}. To hide a local folder, add it under Hidden local folders.` }
  }
  const r = trimSlashes(root)
  // "/acme-corp/group/repo" is a group path with a stray slash, not a folder
  const strayGroup = r !== '' && (trimSlashes(s) === r || trimSlashes(s).startsWith(r + '/')) && s.startsWith('/') && !knownLocal.some((w) => s.startsWith(w.root.replace(/\/+$/, '') + '/'))
  if (s.startsWith('/') && !strayGroup) {
    const local = fromLocal(s, knownLocal)
    if (!local.ok) return local
    s = local.value
  }
  s = trimSlashes(s)
  if (r && s !== r && !s.startsWith(r + '/')) s = `${r}/${s}`
  return { ok: true, value: s }
}

// The company root box: a pasted group link becomes the group path
export function normaliseRoot(input: string): string {
  const s = input.trim().replace(/%2F/gi, '/')
  const link = fromLink(s)
  return trimSlashes(link ?? s)
}
