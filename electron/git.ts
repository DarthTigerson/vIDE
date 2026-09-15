import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

const execFileAsync = promisify(execFile)

export interface GitFileEntry {
  path: string
  status: 'M' | 'A' | 'D' | 'R' | '?'
}

export interface GitStatus {
  staged: GitFileEntry[]
  unstaged: GitFileEntry[]
}

export interface GitAheadBehind {
  ahead: number
  behind: number
}

const DISCOVER_SKIP_DIRS = new Set(['node_modules'])

export const DEFAULT_REPO_SCAN_DEPTH = 4

// Supports the "open a parent folder containing several sibling repos"
// devops workflow, including repos nested more than one level deep (e.g. a
// packages/ layout). Walks up to maxDepth levels below root, skipping
// node_modules and dot-directories, and stops descending into any directory
// once it's identified as a repo itself — so a repo's own submodules don't
// surface as separate top-level entries.
export async function discoverRepos(root: string, maxDepth: number = DEFAULT_REPO_SCAN_DEPTH): Promise<string[]> {
  if (existsSync(join(root, '.git'))) return [root]

  const found: string[] = []

  async function walk(dir: string, depthRemaining: number): Promise<void> {
    if (depthRemaining <= 0) return

    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    const subdirs = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !DISCOVER_SKIP_DIRS.has(entry.name))

    await Promise.all(subdirs.map(async (entry) => {
      const subdir = join(dir, entry.name)
      if (existsSync(join(subdir, '.git'))) {
        found.push(subdir)
        return
      }
      await walk(subdir, depthRemaining - 1)
    }))
  }

  await walk(root, maxDepth)
  return found.sort()
}

export async function getGitBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd })
    const branch = stdout.trim()
    if (branch !== 'HEAD') return branch
    const { stdout: sha } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], { cwd })
    return sha.trim()
  } catch {
    return null
  }
}

// Resolves the repo's actual default branch (e.g. "origin/main") by asking
// the remote directly via `ls-remote --symref` — a single lightweight ref
// lookup, no object transfer. This is deliberately NOT read from the
// locally-cached refs/remotes/origin/HEAD symbolic ref: that ref is only
// written at clone time (or by an explicit `git remote set-head origin -a`)
// and is never refreshed by fetch/pull, so if the default branch is changed
// on the host after the clone (e.g. a master->main rename), every existing
// clone's cached copy goes silently stale and keeps pointing at the old
// branch — confidently wrong, rather than falling through to the heuristic
// fallback in chooseTarget(). Bounded by a short timeout so an unreachable
// remote (offline, VPN, slow network) can't stall the branch-list load;
// on any failure we fall back to the local cache, then to null so callers
// keep their own heuristic fallback (origin/main, origin/master, ...).
export async function getDefaultBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-remote', '--symref', 'origin', 'HEAD'],
      { cwd, timeout: 3000 }
    )
    const match = stdout.match(/^ref:\s+refs\/heads\/(\S+)\s+HEAD/m)
    if (match) return `origin/${match[1]}`
  } catch {
    // Unreachable remote, no origin, or timed out — fall through to the
    // local cache below.
  }

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
      { cwd }
    )
    return stdout.trim() || null
  } catch {
    return null
  }
}

// Runs a plain `git fetch` and reports only success/failure — used for
// automatic background fetches (periodic, on repo open, on branch switch)
// that must never surface output the way the user-triggered Fetch button
// does (which streams through GitRunner into the Git Log tab). Bounded by a
// timeout so a slow/unreachable remote can't hang the caller indefinitely;
// any failure (offline, auth prompt, timeout) is swallowed since callers
// treat this as best-effort.
export async function fetchRemote(cwd: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['fetch'], { cwd, timeout: 15000 })
    return true
  } catch {
    return false
  }
}

export async function getGitBranches(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'],
      { cwd }
    )
    return Array.from(
      new Set(
        stdout
          .split('\n')
          .map((branch) => branch.trim())
          .filter((branch) => branch && !branch.endsWith('/HEAD'))
      )
    )
  } catch {
    return []
  }
}

export interface GitBranchList {
  current: string | null
  local: string[]
  remote: string[]
}

// Remote branches whose short name (after stripping the "origin/" prefix)
// already has a local branch are omitted — they'd just be checkout-noise
// duplicating an entry the Local section already lists.
export async function getBranchList(cwd: string): Promise<GitBranchList> {
  try {
    const [{ stdout: localOut }, { stdout: remoteOut }, current] = await Promise.all([
      execFileAsync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], { cwd }),
      execFileAsync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/remotes'], { cwd }),
      getGitBranch(cwd),
    ])
    const local = localOut.split('\n').map((b) => b.trim()).filter(Boolean)
    const localSet = new Set(local)
    const remote = remoteOut
      .split('\n')
      .map((b) => b.trim())
      .filter((ref) => ref && !ref.endsWith('/HEAD'))
      .filter((ref) => !localSet.has(ref.slice(ref.indexOf('/') + 1)))
    return { current, local, remote }
  } catch {
    return { current: null, local: [], remote: [] }
  }
}

export async function getAheadBehind(cwd: string): Promise<GitAheadBehind | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'],
      { cwd }
    )
    const [behind, ahead] = stdout.trim().split(/\s+/).map(Number)
    return { ahead, behind }
  } catch {
    return null
  }
}

function toStatus(code: string): GitFileEntry['status'] {
  return code === 'A' || code === 'D' || code === 'R' ? code : 'M'
}

export function parsePorcelainStatus(raw: string): GitStatus {
  const staged: GitFileEntry[] = []
  const unstaged: GitFileEntry[] = []
  if (!raw) return { staged, unstaged }

  const entries = raw.split('\0').filter(Boolean)
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const x = entry[0]
    const y = entry[1]
    const path = entry.slice(3)

    if (x === 'R') {
      // porcelain -z emits the old path as a separate NUL-terminated
      // field right after a rename entry — skip over it
      i++
    }

    if (x === '?' && y === '?') {
      unstaged.push({ path, status: '?' })
      continue
    }

    if (x !== ' ' && x !== '?') {
      staged.push({ path, status: toStatus(x) })
    }
    if (y !== ' ' && y !== '?') {
      unstaged.push({ path, status: toStatus(y) })
    }
  }

  return { staged, unstaged }
}

export async function getGitStatus(cwd: string): Promise<GitStatus> {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1', '-z'], { cwd })
    return parsePorcelainStatus(stdout)
  } catch {
    return { staged: [], unstaged: [] }
  }
}

// --directory collapses a whole ignored directory (e.g. node_modules) into a
// single entry instead of every file inside it — exactly what the sidebar
// tree needs to dim a folder without listing thousands of descendants.
export async function getIgnoredPaths(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'],
      { cwd }
    )
    return stdout.split('\0').filter(Boolean).map((path) => path.replace(/\/$/, ''))
  } catch {
    return []
  }
}

// Unified diff of staged changes only — the input for AI-generated commit
// messages (electron/commitMessage.ts).
export async function getStagedDiff(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--staged'], { cwd })
    return stdout
  } catch {
    return ''
  }
}

export async function stageFiles(cwd: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  await execFileAsync('git', ['add', '--', ...paths], { cwd })
}

export async function discardFileChanges(cwd: string, path: string): Promise<void> {
  await execFileAsync('git', ['checkout', '--', path], { cwd })
}

// Reverts every tracked file's unstaged modifications back to the index —
// same scope as discardFileChanges (`checkout -- <path>`), just for
// everything at once. Restoring from the index rather than HEAD is what
// keeps staged changes intact (VIDE-11: staging used to look like a safe
// spot but `reset --hard HEAD` reverted the index too, wiping staged
// changes along with unstaged ones). Untracked files aren't in the index,
// so they're left alone.
export async function discardAllChanges(cwd: string): Promise<void> {
  await execFileAsync('git', ['checkout', '--', '.'], { cwd })
}

export async function unstageFiles(cwd: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  await execFileAsync('git', ['reset', '--', ...paths], { cwd })
}

export async function stageAll(cwd: string): Promise<void> {
  await execFileAsync('git', ['add', '-A'], { cwd })
}

export async function unstageAll(cwd: string): Promise<void> {
  await execFileAsync('git', ['reset'], { cwd })
}

export async function commit(
  cwd: string,
  message: string,
  noVerify?: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const args = ['commit', '-m', message]
    if (noVerify) args.push('--no-verify')
    await execFileAsync('git', args, { cwd })
    return { ok: true }
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr
    return { ok: false, error: stderr?.trim() || 'Commit failed' }
  }
}

async function showRef(cwd: string, ref: string): Promise<string> {
  try {
    // Node's execFile default maxBuffer is 1MB - past that it throws and the
    // catch below silently returns '', which callers (e.g. computeLineChanges
    // for the gutter indicators) treat as "file didn't exist at HEAD",
    // misleadingly marking every line of an unmodified large file as added.
    const { stdout } = await execFileAsync('git', ['show', ref], { cwd, maxBuffer: 10 * 1024 * 1024 })
    return stdout
  } catch {
    return ''
  }
}

// Shared by getGitGraph and getGitBranchDiff/GitGraphPage's loadMore to decide
// whether another page might exist: a page shorter than this was the last one.
// Mirror this value in gitGraphStore.ts / gitBranchDiffStore.ts if it changes.
export const GIT_LOG_PAGE_SIZE = 100
const GIT_LOG_PRETTY_FORMAT = '%H|%P|%s|%an|%ai|%D'

function parseGitLogOutput(stdout: string): import('../src/types/index').GitCommit[] {
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const pipeIdx = line.indexOf('|')
      const hash = line.slice(0, pipeIdx)
      const rest = line.slice(pipeIdx + 1)
      const parts = rest.split('|')
      const parentsRaw = parts[0] ?? ''
      const subject = parts[1] ?? ''
      const author = parts[2] ?? ''
      const date = parts[3] ?? ''
      const refsRaw = parts[4] ?? ''
      const parents = parentsRaw.trim() ? parentsRaw.trim().split(' ').filter(Boolean) : []
      const refs = refsRaw.trim()
        ? refsRaw.split(',').map((r) => r.trim()).filter(Boolean)
        : []
      return { hash, parents, subject, author, date, refs }
    })
}

export async function getGitGraph(
  cwd: string,
  offset: number = 0,
  limit: number = GIT_LOG_PAGE_SIZE
): Promise<import('../src/types/index').GitCommit[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '--all', '--skip', String(offset), '-n', String(limit), `--pretty=format:${GIT_LOG_PRETTY_FORMAT}`],
      { cwd }
    )
    return parseGitLogOutput(stdout)
  } catch {
    return []
  }
}

export async function getGitBranchDiff(
  cwd: string,
  source: string,
  target: string,
  offset: number = 0,
  limit: number = GIT_LOG_PAGE_SIZE
): Promise<import('../src/types/index').GitBranchDiff> {
  if (!source || !target || source === target) {
    return { source, target, commits: [] }
  }

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', `${target}..${source}`, '--skip', String(offset), '-n', String(limit), `--pretty=format:${GIT_LOG_PRETTY_FORMAT}`],
      { cwd }
    )
    return { source, target, commits: parseGitLogOutput(stdout) }
  } catch {
    return { source, target, commits: [] }
  }
}

export async function getGitShowStat(cwd: string, hash: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['show', '--name-only', '--format=', hash],
      { cwd }
    )
    return stdout.split('\n').map((l) => l.trim()).filter(Boolean)
  } catch {
    return []
  }
}

// Backs the editor's gutter change indicators — the file's content as of
// HEAD, to diff against the live buffer client-side. Resolves to '' (via
// showRef's error handling) for a new/untracked file, same as everything
// else built on showRef, so the whole file counts as added.
export async function getFileAtHead(cwd: string, path: string): Promise<string> {
  return showRef(cwd, `HEAD:${path}`)
}

export async function getDiffContent(
  cwd: string,
  path: string,
  staged: boolean
): Promise<{ original: string; modified: string }> {
  if (staged) {
    const original = await showRef(cwd, `HEAD:${path}`)
    const modified = await showRef(cwd, `:${path}`)
    return { original, modified }
  }

  const original = await showRef(cwd, `:${path}`)
  let modified = ''
  try {
    modified = await readFile(join(cwd, path), 'utf-8')
  } catch {
    modified = ''
  }
  return { original, modified }
}

// Same shape as getDiffContent above, but for a specific historical commit
// rather than the working tree: compares the file against its first parent.
// showRef already resolves to '' on any git error, so this needs no extra
// handling for the initial commit (no `^`) or a file the commit added.
export async function getCommitDiffContent(
  cwd: string,
  hash: string,
  path: string
): Promise<{ original: string; modified: string }> {
  const [original, modified] = await Promise.all([
    showRef(cwd, `${hash}^:${path}`),
    showRef(cwd, `${hash}:${path}`),
  ])
  return { original, modified }
}

// One line of `git blame`'s output: which commit last touched it, and that
// commit's author/date/summary. Backs the editor's blame annotations
// (src/lib/gitBlame.ts + src/components/Editor/blameAnnotations.ts on the
// renderer side).
export interface GitBlameLine {
  line: number
  hash: string
  author: string
  authorTime: number // unix seconds, straight off `author-time`
  summary: string
}

export interface GitFileBlame {
  headCommit: string
  lines: GitBlameLine[]
}

// Parses `git blame --line-porcelain` output. --line-porcelain (as opposed
// to plain --porcelain) re-emits every metadata field - author, author-time,
// summary, ... - above EVERY line, not just the first time a commit is seen,
// so in practice a content line's metadata is always the block directly
// above it. metaByHash is a defensive fallback only (kept in case a line's
// block is ever missing a field git normally always includes), not load-
// bearing for the common case.
export function parseBlamePorcelain(raw: string): GitBlameLine[] {
  const result: GitBlameLine[] = []
  if (!raw) return result

  const metaByHash = new Map<string, { author: string; authorTime: number; summary: string }>()
  const headerRe = /^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/

  let hash = ''
  let finalLine = 0
  let author: string | undefined
  let authorTime: number | undefined
  let summary: string | undefined

  for (const entry of raw.split('\n')) {
    const header = entry.match(headerRe)
    if (header) {
      hash = header[1]
      finalLine = Number(header[2])
      continue
    }
    if (entry.startsWith('author ')) {
      author = entry.slice('author '.length)
      continue
    }
    if (entry.startsWith('author-time ')) {
      authorTime = Number(entry.slice('author-time '.length))
      continue
    }
    if (entry.startsWith('summary ')) {
      summary = entry.slice('summary '.length)
      continue
    }
    if (entry.startsWith('\t')) {
      const cached = metaByHash.get(hash)
      const resolvedAuthor = author ?? cached?.author ?? ''
      const resolvedAuthorTime = authorTime ?? cached?.authorTime ?? 0
      const resolvedSummary = summary ?? cached?.summary ?? ''
      if (author !== undefined || authorTime !== undefined || summary !== undefined) {
        metaByHash.set(hash, { author: resolvedAuthor, authorTime: resolvedAuthorTime, summary: resolvedSummary })
      }
      result.push({ line: finalLine, hash, author: resolvedAuthor, authorTime: resolvedAuthorTime, summary: resolvedSummary })
      author = undefined
      authorTime = undefined
      summary = undefined
      continue
    }
    // author-mail, committer*, previous, filename, boundary - not needed here.
  }

  return result
}

// Backs the editor's blame annotations: one `git blame` call for the whole
// file, scoped to HEAD (never per-line, and never the live working tree) -
// same HEAD-relative semantics as getFileAtHead above, so results stay
// stable regardless of uncommitted edits in the buffer. Also resolves the
// current HEAD commit in the same round trip, so the renderer can key its
// cache on (repo, file, HEAD commit) without a second IPC call just to look
// that up. maxBuffer bumped for the same reason as showRef - a large file's
// blame output can exceed Node's 1MB default.
export async function getFileBlame(cwd: string, path: string): Promise<GitFileBlame> {
  try {
    const [{ stdout: headOut }, { stdout: blameOut }] = await Promise.all([
      execFileAsync('git', ['rev-parse', 'HEAD'], { cwd }),
      execFileAsync('git', ['blame', '--line-porcelain', 'HEAD', '--', path], { cwd, maxBuffer: 10 * 1024 * 1024 }),
    ])
    return { headCommit: headOut.trim(), lines: parseBlamePorcelain(blameOut) }
  } catch {
    return { headCommit: '', lines: [] }
  }
}
