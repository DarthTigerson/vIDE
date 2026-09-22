import { ipcMain, app, BrowserWindow } from 'electron'
import { readFile, writeFile, mkdir, access, readdir } from 'fs/promises'
import { join, dirname, relative } from 'path'
import { execFile } from 'child_process'
import { readTodosData, writeTodosData } from './todosStore'
import type { TodosData, TodoProject, Todo } from './todosStore'
import { shouldSkipUsageOnlyCommit } from './usageCommitThrottle'
import { buildAuthUrl, SYNC_GIT_CONFIG_ARGS, SYNC_GIT_ENV } from './configRepoAuth'

export interface ConfigRepoSettings {
  enabled: boolean
  repoUrl: string
  token: string
  categories: Record<string, boolean>
}

const DEFAULT_SETTINGS: ConfigRepoSettings = {
  enabled: false,
  repoUrl: '',
  token: '',
  categories: {
    general: true, models: true, git: true, docker: true,
    integrations: true, notes: true, todo: true, jira: true,
  },
}

// Allowlist guards both shell-command arguments and file-write paths.
const ALLOWED_CATEGORIES = new Set([
  'general', 'models', 'git', 'docker', 'integrations', 'notes', 'todo', 'jira',
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

// Run git with args as an array — execFile never invokes a shell,
// so no shell metacharacter injection is possible regardless of arg content.
function runGit(args: string[], opts: { timeout?: number; cwd?: string } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      [...SYNC_GIT_CONFIG_ARGS, ...args],
      { timeout: opts.timeout, cwd: opts.cwd, encoding: 'utf8', env: { ...process.env, ...SYNC_GIT_ENV } },
      (err, stdout) => {
        if (err) reject(err)
        else resolve(stdout as string)
      },
    )
  })
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
    await runGit(['fetch', 'origin'], { cwd: dir, timeout: 20000 })
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

// Merge two usage-history JSONL line arrays: union by snapshot timestamp,
// sorted ascending. Duplicate ts values keep the first occurrence.
function mergeUsageHistory(a: string[], b: string[]): string[] {
  const byTs = new Map<number, string>()
  for (const line of [...a, ...b]) {
    try {
      const snap = JSON.parse(line) as { ts: number }
      if (!byTs.has(snap.ts)) byTs.set(snap.ts, line)
    } catch { /* skip corrupt lines */ }
  }
  return [...byTs.entries()].sort(([x], [y]) => x - y).map(([, line]) => line)
}

// Additive merge: b wins for shared IDs, a-only items are preserved.
// Call as mergeTodos(remote, local) to get local-wins; (local, remote) for remote-wins.
function mergeTodosData(a: TodosData, b: TodosData): TodosData {
  const bById = new Map<string, Todo>(b.todos.map((t) => [t.id, t]))
  const mergedTodos = [
    ...b.todos,
    ...a.todos.filter((t) => !bById.has(t.id)),
  ]
  const bProjectById = new Map<string, TodoProject>(b.projects.map((p) => [p.id, p]))
  const mergedProjects = [
    ...b.projects,
    ...a.projects.filter((p) => !bProjectById.has(p.id)),
  ]
  return { projects: mergedProjects, todos: mergedTodos }
}

// Fetch remote and return its current localStorage settings. Never writes locally
// (except for file-based categories — todos and notes — handled here directly).
async function pullSettings(
  categories: Record<string, boolean>,
): Promise<Record<string, Record<string, string>>> {
  if (!await isRepoCloned()) throw new Error('Repository not connected.')
  await ensureGitUserConfig()
  try {
    await runGit(['fetch', 'origin'], { cwd: repoDir(), timeout: 20000 })
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
      // remote wins for shared IDs; local-only items preserved
      await writeTodosData(app.getPath('userData'), mergeTodosData(local, remote))
    } catch { /* no todos in remote yet */ }
  }

  // ── File-based: usage history ──────────────────────────────────────────────
  try {
    const raw = await runGit(['show', 'origin/HEAD:usage-history.jsonl'], { cwd: repoDir(), timeout: 10000 })
    const remoteLines = raw.trim().split('\n').filter(Boolean)
    const localFile = join(app.getPath('userData'), 'usage-history.jsonl')
    let localLines: string[] = []
    try { localLines = (await readFile(localFile, 'utf8')).trim().split('\n').filter(Boolean) } catch {}
    const merged = mergeUsageHistory(localLines, remoteLines)
    await writeFile(localFile, merged.join('\n') + (merged.length ? '\n' : ''), 'utf8')
  } catch { /* no usage history in remote yet */ }

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
        await runGit(['fetch', 'origin'], { cwd: dir, timeout: 20000 })
      } catch { /* offline */ }
      try {
        await runGit(['reset', '--hard', 'origin/HEAD'], { cwd: dir, timeout: 10000 })
      } catch { /* no remote HEAD yet — empty repo */ }

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

      // ── File-based: usage history ──────────────────────────────────────────
      try {
        const localFile = join(app.getPath('userData'), 'usage-history.jsonl')
        const repoFile = join(dir, 'usage-history.jsonl')
        let localLines: string[] = []
        let repoLines: string[] = []
        try { localLines = (await readFile(localFile, 'utf8')).trim().split('\n').filter(Boolean) } catch {}
        try { repoLines = (await readFile(repoFile, 'utf8')).trim().split('\n').filter(Boolean) } catch {}
        const merged = mergeUsageHistory(localLines, repoLines)
        const content = merged.join('\n') + (merged.length ? '\n' : '')
        await writeFile(repoFile, content, 'utf8')
        await writeFile(localFile, content, 'utf8')
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
      if (shouldSkipUsageOnlyCommit(staged, lastCommitAt, Date.now())) {
        await runGit(['reset'], { cwd: dir })
        return
      }

      let committed = false
      try {
        await runGit(['commit', '-m', `vIDE sync ${new Date().toISOString()}`], { cwd: dir })
        committed = true
      } catch { /* nothing changed — clean working tree */ }

      try {
        await runGit(['push', 'origin', 'HEAD'], { cwd: dir, timeout: 30000 })
        if (committed) lastCommitAt = Date.now()
        return // success
      } catch (err) {
        // Check both .stderr and .message — Node's execFile may put text in either
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
  if (!await isRepoCloned()) return
  const dir = repoDir()
  try {
    await runGit(['fetch', 'origin'], { cwd: dir, timeout: 20000 })
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
}
