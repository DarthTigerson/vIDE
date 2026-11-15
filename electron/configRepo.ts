import { ipcMain, app, BrowserWindow } from 'electron'
import { readFile, writeFile, mkdir, access, readdir, rm } from 'fs/promises'
import { join, dirname, relative } from 'path'
import { spawn } from 'child_process'
import { readTodosData, writeTodosData } from './todosStore'
import type { TodosData } from './todosStore'
import { mergeTodosData } from './todosMerge'
import { readScriptsData, mutateScriptsData, type ScriptsData } from './scriptsData'
import { mergeScriptsData } from './scriptsMerge'
import { shouldSkipUsageOnlyCommit } from './usageCommitThrottle'
import {
  LEGACY_USAGE_FILE, USAGE_SHARD_DIR, mergeIntoLocalUsage, readLocalUsageDays, shardsToPull, syncUsageHistory,
} from './usageHistorySync'
import { buildAuthUrl, SYNC_GIT_CONFIG_ARGS, SYNC_GIT_ENV } from './configRepoAuth'

export interface ConfigRepoSettings {
  enabled: boolean
  repoUrl: string
  token: string
  categories: Record<string, boolean>
}

// Bumped whenever a release adds a synced value (e.g. a new theme or
// background image) that older builds can't render. Stamped into the repo's
// meta.json on every push; a build that pulls a higher number than this knows
// the config came from a newer vIDE and shows the update wall instead of
// applying it (see src/lib/preBootSync.ts, VIDE-162). Repos written before
// meta.json existed read as version 1. Version 3 moved usage history into
// daily shards and squashes the old history once (see compactHistory): an
// older build pushing the single file back would regrow it.
export const CONFIG_SCHEMA_VERSION = 3
const META_FILE = 'meta.json'

// Set true by the renderer (configRepo:setGated) once pre-boot sync detects an
// incompatible config. While gated this machine must not push: its older
// config would overwrite the newer machine's settings and start a downgrade
// ping-pong. Cleared only by a relaunch (i.e. after updating).
let gated = false

const DEFAULT_SETTINGS: ConfigRepoSettings = {
  enabled: false,
  repoUrl: '',
  token: '',
  categories: {
    general: true, models: true, git: true, docker: true,
    integrations: true, notes: true, todo: true, jira: true, scripts: true,
  },
}

// Allowlist guards both shell-command arguments and file-write paths.
const ALLOWED_CATEGORIES = new Set([
  'general', 'models', 'git', 'docker', 'integrations', 'notes', 'todo', 'jira', 'scripts',
])

export interface ConflictEntry {
  category: string
  diffKeys: string[]
  localData: Record<string, string>
  remoteData: Record<string, string>
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'config-repo-settings.json')
}

function repoDir(): string {
  return join(app.getPath('userData'), 'config-repo')
}

// Delta resolution in fetch (index-pack) and repack (pack-objects) defaults to
// one thread per core with an unbounded window. On a repo full of large
// near-identical blobs that reached several GB per process and crashed 8 GB
// machines at launch. Background gc/maintenance are off too: they run
// detached, outside every timeout, and the sync repo is compacted by
// cleanUpLocalRepo instead.
const SYNC_GIT_MEMORY_ARGS = [
  '-c', 'pack.threads=1',
  '-c', 'pack.windowMemory=64m',
  '-c', 'pack.deltaCacheSize=16m',
  '-c', 'core.deltaBaseCacheSize=16m',
  '-c', 'gc.auto=0',
  '-c', 'maintenance.auto=false',
]

// Run git with args as an array — spawn never invokes a shell, so no shell
// metacharacter injection is possible regardless of arg content. git runs in
// its own process group so a timeout kills the whole group: killing only
// `git fetch` left its `index-pack` child running (and growing), and the next
// periodic fetch started another one next to it.
function runGit(args: string[], opts: { timeout?: number; cwd?: string } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', [...SYNC_GIT_CONFIG_ARGS, ...SYNC_GIT_MEMORY_ARGS, ...args], {
      cwd: opts.cwd,
      env: { ...process.env, ...SYNC_GIT_ENV },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk })
    const timer = opts.timeout
      ? setTimeout(() => {
          timedOut = true
          try { process.kill(-child.pid!, 'SIGKILL') } catch { /* already gone */ }
        }, opts.timeout)
      : null
    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (code === 0 && !timedOut) return resolve(stdout)
      const reason = timedOut ? `timed out after ${opts.timeout}ms` : `exited with code ${code}`
      reject(Object.assign(new Error(`git ${args[0]} ${reason}: ${stderr}`), { stdout, stderr }))
    })
  })
}

// checkRemote (every 30s), the periodic push and pull all fetch. A fetch that
// is still running is joined rather than started a second time.
let fetchInFlight: Promise<string> | null = null

function fetchOrigin(dir: string): Promise<string> {
  fetchInFlight ??= runGit(['fetch', 'origin'], { cwd: dir, timeout: 20000 }).finally(() => { fetchInFlight = null })
  return fetchInFlight
}

// Walks dir recursively and returns relative paths of all .md files
// (e.g. "folder/note.md"). Returns [] if dir doesn't exist.
async function collectMdFiles(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => null)
  if (!entries) return []
  const files: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await collectMdFiles(full, base))
    else if (entry.name.endsWith('.md')) files.push(relative(base, full))
  }
  return files
}

async function readSettings(): Promise<ConfigRepoSettings> {
  try {
    const raw = await readFile(settingsPath(), 'utf8')
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

async function saveSettings(s: ConfigRepoSettings): Promise<void> {
  await writeFile(settingsPath(), JSON.stringify(s, null, 2), 'utf8')
}

async function isRepoCloned(): Promise<boolean> {
  try {
    await access(join(repoDir(), '.git'))
    return true
  } catch {
    return false
  }
}

async function ensureGitUserConfig(): Promise<void> {
  const dir = repoDir()
  try {
    await runGit(['config', 'user.email'], { cwd: dir })
  } catch {
    await runGit(['config', 'user.email', 'vide-sync@local'], { cwd: dir })
    await runGit(['config', 'user.name', 'vIDE Sync'], { cwd: dir })
  }
}

async function connectRepo(repoUrl: string, token: string): Promise<void> {
  const authUrl = buildAuthUrl(repoUrl, token)
  const dir = repoDir()

  if (await isRepoCloned()) {
    await runGit(['remote', 'set-url', 'origin', authUrl], { cwd: dir })
    await fetchOrigin(dir)
  } else {
    await mkdir(dir, { recursive: true })
    try {
      await runGit(['clone', authUrl, dir], { timeout: 60000 })
    } catch (err) {
      const msg = (err as { stderr?: string }).stderr ?? ''
      if (msg.includes('empty repository') || msg.includes('nothing to clone') || msg.includes('warning: You appear')) {
        await runGit(['init'], { cwd: dir })
        await runGit(['remote', 'add', 'origin', authUrl], { cwd: dir })
      } else {
        throw err
      }
    }
  }
  await ensureGitUserConfig()
}

async function readRemoteCategoryFile(category: string): Promise<Record<string, string> | null> {
  if (!ALLOWED_CATEGORIES.has(category)) return null
  const dir = repoDir()
  try {
    const stdout = await runGit(['show', `origin/HEAD:${category}.json`], { cwd: dir, timeout: 10000 })
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

// Reads the schema version stamped in the repo's meta.json. A repo written by
// a vIDE from before meta.json existed (or with no remote HEAD yet) reads as
// version 1 — i.e. "nothing newer than the baseline."
async function getRemoteSchemaVersion(): Promise<number> {
  if (!await isRepoCloned()) return 1
  try {
    const raw = await runGit(['show', `origin/HEAD:${META_FILE}`], { cwd: repoDir(), timeout: 10000 })
    const n = JSON.parse(raw).schemaVersion
    return typeof n === 'number' && Number.isFinite(n) ? n : 1
  } catch {
    return 1
  }
}

// Only rewrites the local file (and so only wakes the Scripts watcher) when
// the merge actually changed something — the periodic push runs every two
// minutes.
async function writeScriptsIfChanged(merged: ScriptsData): Promise<void> {
  const dataDir = app.getPath('userData')
  const local = await readScriptsData(dataDir)
  if (JSON.stringify(local) === JSON.stringify(merged)) return
  // Through the write queue, re-merging with whatever is on disk by then, so
  // an editor save that landed during the push isn't overwritten.
  await mutateScriptsData(dataDir, (data) => {
    data.scripts = mergeScriptsData(merged, data).scripts
  })
}

function broadcastNotesChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('notes:changed')
  }
}

function broadcastRemoteSettings(kvMap: Record<string, string>): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('configRepo:remoteSettings', kvMap)
  }
}

// Fetch remote and return its current localStorage settings. Never writes locally
// (except for file-based categories — todos and notes — handled here directly).
async function pullSettings(
  categories: Record<string, boolean>,
): Promise<Record<string, Record<string, string>>> {
  if (!await isRepoCloned()) throw new Error('Repository not connected.')
  await ensureGitUserConfig()
  try {
    await fetchOrigin(repoDir())
  } catch { /* offline */ }

  const result: Record<string, Record<string, string>> = {}
  for (const [cat, enabled] of Object.entries(categories)) {
    if (!enabled) continue
    const data = await readRemoteCategoryFile(cat)
    if (data) result[cat] = data
  }

  // ── File-based: todos ──────────────────────────────────────────────────────
  if (categories.todo) {
    try {
      const raw = await runGit(['show', 'origin/HEAD:todos-data.json'], { cwd: repoDir(), timeout: 10000 })
      const remote: TodosData = JSON.parse(raw)
      const local = await readTodosData(app.getPath('userData'))
      // newer copy wins for shared IDs; local-only items preserved
      await writeTodosData(app.getPath('userData'), mergeTodosData(local, remote))
    } catch { /* no todos in remote yet */ }
  }

  // ── File-based: scripts ────────────────────────────────────────────────────
  // scripts-data.json, not scripts.json: <category>.json is the scripts
  // category's own localStorage settings file. Project tags
  // (script-tags.json) are machine-local and never synced.
  if (categories.scripts) {
    try {
      const raw = await runGit(['show', 'origin/HEAD:scripts-data.json'], { cwd: repoDir(), timeout: 10000 })
      const remote: ScriptsData = JSON.parse(raw)
      await writeScriptsIfChanged(mergeScriptsData(remote, await readScriptsData(app.getPath('userData'))))
    } catch { /* no scripts in remote yet */ }
  }

  // ── File-based: usage history ──────────────────────────────────────────────
  try {
    const localFile = join(app.getPath('userData'), 'usage-history.jsonl')
    const listing = await runGit(['ls-tree', '--name-only', `origin/HEAD:${USAGE_SHARD_DIR}`], { cwd: repoDir(), timeout: 10000 })
    const shardFiles = listing.trim().split('\n').filter((f) => f.endsWith('.jsonl'))
    const remoteLines: string[] = []
    for (const file of shardsToPull(shardFiles, await readLocalUsageDays(localFile), Date.now())) {
      const raw = await runGit(['show', `origin/HEAD:${USAGE_SHARD_DIR}/${file}`], { cwd: repoDir(), timeout: 10000 })
      remoteLines.push(...raw.trim().split('\n').filter(Boolean))
    }
    await mergeIntoLocalUsage(localFile, remoteLines)
  } catch { /* no usage history in remote yet (or only the legacy file, which the next push folds in) */ }

  // ── File-based: notes ──────────────────────────────────────────────────────
  if (categories.notes) {
    try {
      // -r lists all blobs recursively, so notes in subdirectories are included
      const listing = await runGit(['ls-tree', '-r', '--name-only', 'origin/HEAD:notes'], { cwd: repoDir(), timeout: 10000 })
      const noteFiles = listing.trim().split('\n').filter((f) => f.endsWith('.md'))
      const localNotesDir = join(app.getPath('userData'), 'notes')
      await mkdir(localNotesDir, { recursive: true })
      for (const file of noteFiles) {
        const content = await runGit(['show', `origin/HEAD:notes/${file}`], { cwd: repoDir(), timeout: 10000 })
        const dest = join(localNotesDir, file)
        await mkdir(dirname(dest), { recursive: true })
        await writeFile(dest, content, 'utf8')
      }
      broadcastNotesChanged()
    } catch { /* no notes directory in remote yet */ }
  }

  return result
}

async function remoteHasLegacyUsageFile(dir: string): Promise<boolean> {
  try {
    const listing = await runGit(['ls-tree', '--name-only', 'origin/HEAD'], { cwd: dir, timeout: 10000 })
    return listing.split('\n').includes(LEGACY_USAGE_FILE)
  } catch {
    return false
  }
}

// One-time squash of a remote written before daily usage shards: replaces its
// history with a single root commit of the current tree. --force-with-lease
// against the tip we just reset to means a push another machine made in the
// meantime is never lost — the push is rejected and the retry loop rebuilds
// on top of it. Other machines need nothing special: every push starts with
// fetch + reset --hard origin/HEAD, which follows the rewritten branch.
async function compactHistory(dir: string): Promise<void> {
  const remoteRef = (await runGit(['rev-parse', '--abbrev-ref', 'origin/HEAD'], { cwd: dir })).trim()
  const branch = remoteRef.replace(/^origin\//, '')
  const oldTip = (await runGit(['rev-parse', 'origin/HEAD'], { cwd: dir })).trim()
  const tree = (await runGit(['rev-parse', 'HEAD^{tree}'], { cwd: dir })).trim()
  const root = (await runGit(['commit-tree', tree, '-m', 'vIDE sync: compacted history'], { cwd: dir })).trim()
  await runGit(['reset', '--soft', root], { cwd: dir })
  await runGit(
    ['push', `--force-with-lease=${branch}:${oldTip}`, 'origin', `HEAD:${branch}`],
    { cwd: dir, timeout: 30000 },
  )
}

// Once the remote is compacted, every clone still holds the old history's
// objects locally (200+ MB). Dropping reflogs and pruning leaves only what
// the new short history reaches, so this repack is small and cheap. Checked
// once per launch; a no-op for a repo that's already small.
const LOCAL_REPO_CLEANUP_BYTES = 64 * 1024 * 1024
let localCleanupChecked = false

async function cleanUpLocalRepo(dir: string): Promise<void> {
  if (localCleanupChecked) return
  localCleanupChecked = true
  if (await remoteHasLegacyUsageFile(dir)) return
  const stats = await runGit(['count-objects', '-v'], { cwd: dir })
  const kib = (key: string) => Number(stats.match(new RegExp(`^${key}: (\\d+)`, 'm'))?.[1] ?? 0)
  if ((kib('size') + kib('size-pack') + kib('size-garbage')) * 1024 < LOCAL_REPO_CLEANUP_BYTES) return
  // An interrupted fetch leaves its pack marked .keep, and gc never repacks
  // or deletes a kept pack — on a real bloated clone those held most of the
  // old history. Safe to drop once no fetch of ours is running.
  await fetchInFlight?.catch(() => {})
  const packDir = join(dir, '.git', 'objects', 'pack')
  for (const file of await readdir(packDir).catch(() => [] as string[])) {
    if (file.endsWith('.keep')) await rm(join(packDir, file), { force: true })
  }
  await runGit(['reflog', 'expire', '--expire=now', '--all'], { cwd: dir, timeout: 60000 })
  await runGit(['gc', '--prune=now'], { cwd: dir, timeout: 120000 })
}

// Mutex: serialises concurrent pushSettings calls within the same process so
// two simultaneous invocations (e.g. startup push + debounced push) never
// race over the git index and produce an index.lock error.
let pushLock = Promise.resolve()

// When this machine last pushed a commit (0 until its first this launch).
// Per process on purpose — see usageCommitThrottle.
let lastCommitAt = 0

// Write local settings to the repo and push. Retries up to 3 times on
// non-fast-forward so two machines pushing concurrently always converge.
// lastSyncAt is the ms timestamp of our own last successful push — if the
// remote commit is newer than that, another machine changed something and
// remote wins for localStorage categories.
export async function pushSettings(data: Record<string, Record<string, string>>, lastSyncAt: number): Promise<void> {
  // Pre-boot sync found incompatible (newer) config on the remote. Stay
  // read-only so this older build can't clobber the newer machine's settings.
  if (gated) return

  let release!: () => void
  const prev = pushLock
  pushLock = new Promise<void>((r) => { release = r })
  await prev

  try {
    const dir = repoDir()
    if (!await isRepoCloned()) return
    await ensureGitUserConfig()
    await mkdir(dir, { recursive: true })

    for (let attempt = 0; attempt < 3; attempt++) {
      // Fetch + reset to the current remote tip so our commit is always a
      // fast-forward, even if another machine pushed since we last fetched.
      try {
        await fetchOrigin(dir)
      } catch { /* offline */ }
      try {
        await runGit(['reset', '--hard', 'origin/HEAD'], { cwd: dir, timeout: 10000 })
      } catch { /* no remote HEAD yet — empty repo */ }

      // A remote still holding the single usage file was written before the
      // daily shards, and so carries one full copy of it per commit.
      const needsCompaction = await remoteHasLegacyUsageFile(dir)

      // Check whether remote has commits newer than our last push. If so,
      // another machine changed settings since we last synced — their state
      // is authoritative. Apply it to the renderer and merge it into `data`
      // so we don't overwrite it on the next push.
      try {
        const ctStr = await runGit(['log', 'origin/HEAD', '-1', '--format=%ct'], { cwd: dir })
        const remoteTsMs = parseInt(ctStr.trim()) * 1000
        if (remoteTsMs > lastSyncAt) {
          const remoteKvMap: Record<string, string> = {}
          for (const cat of ALLOWED_CATEGORIES) {
            try {
              Object.assign(remoteKvMap, JSON.parse(await readFile(join(dir, `${cat}.json`), 'utf8')))
            } catch { /* category not in remote yet */ }
          }
          if (Object.keys(remoteKvMap).length > 0) {
            broadcastRemoteSettings(remoteKvMap)
            // Merge remote into data so the category files we commit reflect
            // the remote state — prevents the next periodic push from writing
            // stale local values back over the remote's changes.
            for (const [cat, kvMap] of Object.entries(data)) {
              if (!ALLOWED_CATEGORIES.has(cat)) continue
              try {
                Object.assign(kvMap, JSON.parse(await readFile(join(dir, `${cat}.json`), 'utf8')))
              } catch {}
            }
          }
        }
      } catch { /* no remote commits yet — fresh repo, local wins */ }

      // Schema stamp: lets an older build on another machine detect that this
      // config was written by a newer vIDE. Identical content every push unless
      // the version actually bumped, so it never produces a commit on its own.
      await writeFile(join(dir, META_FILE), JSON.stringify({ schemaVersion: CONFIG_SCHEMA_VERSION }, null, 2) + '\n', 'utf8')

      // localStorage-backed categories
      for (const [cat, kvMap] of Object.entries(data)) {
        if (!ALLOWED_CATEGORIES.has(cat)) continue
        await writeFile(join(dir, `${cat}.json`), JSON.stringify(kvMap, null, 2), 'utf8')
      }

      // ── File-based: todos ──────────────────────────────────────────────────
      if ('todo' in data) {
        try {
          let repoTodos: TodosData = { projects: [], todos: [] }
          try {
            repoTodos = JSON.parse(await readFile(join(dir, 'todos-data.json'), 'utf8'))
          } catch { /* remote had no todos yet */ }
          const localTodos = await readTodosData(app.getPath('userData'))
          const merged = mergeTodosData(repoTodos, localTodos)
          await writeFile(join(dir, 'todos-data.json'), JSON.stringify(merged), 'utf8')
          await writeTodosData(app.getPath('userData'), merged)
        } catch { /* no todos yet */ }
      }

      // ── File-based: scripts ────────────────────────────────────────────────
      if ('scripts' in data) {
        try {
          let repoScripts: ScriptsData = { scripts: [] }
          try {
            repoScripts = JSON.parse(await readFile(join(dir, 'scripts-data.json'), 'utf8'))
          } catch { /* remote had no scripts yet */ }
          const merged = mergeScriptsData(repoScripts, await readScriptsData(app.getPath('userData')))
          await writeFile(join(dir, 'scripts-data.json'), JSON.stringify(merged, null, 2), 'utf8')
          await writeScriptsIfChanged(merged)
        } catch { /* no scripts yet */ }
      }

      // ── File-based: usage history ──────────────────────────────────────────
      try {
        await syncUsageHistory(join(app.getPath('userData'), 'usage-history.jsonl'), dir)
      } catch { /* no usage history yet */ }

      // ── File-based: notes ──────────────────────────────────────────────────
      if ('notes' in data) {
        try {
          const localNotesDir = join(app.getPath('userData'), 'notes')
          const repoNotesDir = join(dir, 'notes')
          await mkdir(repoNotesDir, { recursive: true })
          await mkdir(localNotesDir, { recursive: true })

          // Collect relative paths recursively (handles subdirectory folder structure)
          const localRelPaths = await collectMdFiles(localNotesDir)
          const localSet = new Set(localRelPaths)
          for (const rel of localRelPaths) {
            const content = await readFile(join(localNotesDir, rel), 'utf8')
            const dest = join(repoNotesDir, rel)
            await mkdir(dirname(dest), { recursive: true })
            await writeFile(dest, content, 'utf8')
          }

          const repoRelPaths = await collectMdFiles(repoNotesDir)
          let notesChanged = false
          for (const rel of repoRelPaths) {
            if (localSet.has(rel)) continue
            const content = await readFile(join(repoNotesDir, rel), 'utf8')
            const dest = join(localNotesDir, rel)
            await mkdir(dirname(dest), { recursive: true })
            await writeFile(dest, content, 'utf8')
            notesChanged = true
          }
          if (notesChanged) broadcastNotesChanged()
        } catch { /* no notes directory yet */ }
      }

      await runGit(['add', '-A'], { cwd: dir })

      // Usage snapshots land every poll, so a push that changed nothing else
      // would commit every couple of minutes. Wait it out (see usageCommitThrottle);
      // the local usage file keeps the data and the next real commit carries it.
      const staged = (await runGit(['diff', '--cached', '--name-only'], { cwd: dir })).split('\n').filter(Boolean)
      if (!needsCompaction && shouldSkipUsageOnlyCommit(staged, lastCommitAt, Date.now())) {
        await runGit(['reset'], { cwd: dir })
        return
      }

      let committed = false
      try {
        await runGit(['commit', '-m', `vIDE sync ${new Date().toISOString()}`], { cwd: dir })
        committed = true
      } catch { /* nothing changed — clean working tree */ }

      try {
        if (needsCompaction) await compactHistory(dir)
        else await runGit(['push', 'origin', 'HEAD'], { cwd: dir, timeout: 30000 })
        if (committed) lastCommitAt = Date.now()
        await cleanUpLocalRepo(dir).catch(() => { /* best-effort; retried next launch */ })
        return // success
      } catch (err) {
        // Check both .stderr and .message — git's output can land in either
        const errText = ((err as { stderr?: string }).stderr ?? '') + ((err as Error).message ?? '')
        const isRace = errText.includes('non-fast-forward') || errText.includes('rejected') || errText.includes('cannot lock ref')
        if (attempt < 2 && isRace) {
          // Random 1-4 s jitter so two machines retrying simultaneously don't
          // collide on the next attempt as well.
          await new Promise((r) => setTimeout(r, 1000 + Math.random() * 3000))
          continue
        }
        throw err
      }
    }
  } finally {
    release()
  }
}

// Lightweight pull-only check: fetch remote, and if it has commits newer than
// lastSyncAt, broadcast the remote settings to all windows. No commit, no push.
async function checkRemote(lastSyncAt: number): Promise<void> {
  if (gated) return
  if (!await isRepoCloned()) return
  const dir = repoDir()
  try {
    await fetchOrigin(dir)
  } catch { return /* offline */ }

  try {
    const ctStr = await runGit(['log', 'origin/HEAD', '-1', '--format=%ct'], { cwd: dir })
    const remoteTsMs = parseInt(ctStr.trim()) * 1000
    if (remoteTsMs <= lastSyncAt) return // remote has nothing newer than what we pushed

    const remoteKvMap: Record<string, string> = {}
    for (const cat of ALLOWED_CATEGORIES) {
      try {
        const raw = await runGit(['show', `origin/HEAD:${cat}.json`], { cwd: dir, timeout: 10000 })
        Object.assign(remoteKvMap, JSON.parse(raw))
      } catch { /* category not in remote yet */ }
    }
    if (Object.keys(remoteKvMap).length > 0) {
      broadcastRemoteSettings(remoteKvMap)
    }
  } catch { /* no remote commits yet */ }
}

// Clones made before the oauth2:<token> URL fix still carry the old
// token-as-username remote URL, which fails on GitLab. Rewrite it from the
// saved settings on launch so existing installs don't have to reconnect.
async function refreshRemoteUrl(): Promise<void> {
  const { repoUrl, token } = await readSettings()
  if (!repoUrl || !token || !await isRepoCloned()) return
  await runGit(['remote', 'set-url', 'origin', buildAuthUrl(repoUrl, token)], { cwd: repoDir() })
}

export function registerConfigRepoHandlers(): void {
  refreshRemoteUrl().catch(() => { /* malformed saved URL — reconnect surfaces it */ })

  ipcMain.handle('configRepo:getSettings', () => readSettings())

  ipcMain.handle('configRepo:setSettings', async (_e, patch: Partial<ConfigRepoSettings>) => {
    const current = await readSettings()
    await saveSettings({ ...current, ...patch })
  })

  ipcMain.handle('configRepo:connect', async (_e, repoUrl: string, token: string) => {
    await connectRepo(repoUrl, token)
    const current = await readSettings()
    await saveSettings({ ...current, repoUrl, token, enabled: true })
  })

  ipcMain.handle(
    'configRepo:pull',
    (_e, categories: Record<string, boolean>) => pullSettings(categories),
  )

  ipcMain.handle(
    'configRepo:push',
    (_e, data: Record<string, Record<string, string>>, lastSyncAt: number) => pushSettings(data, lastSyncAt),
  )

  ipcMain.handle(
    'configRepo:checkRemote',
    (_e, lastSyncAt: number) => checkRemote(lastSyncAt),
  )

  // Compatibility gate (VIDE-162): the schema version this build understands,
  // the one stamped in the remote repo, and a switch the renderer flips to stop
  // this machine pushing once it detects incompatible config.
  ipcMain.handle('configRepo:getSchemaVersion', () => CONFIG_SCHEMA_VERSION)
  ipcMain.handle('configRepo:getRemoteSchemaVersion', () => getRemoteSchemaVersion())
  ipcMain.handle('configRepo:setGated', (_e, value: boolean) => { gated = value })
}
