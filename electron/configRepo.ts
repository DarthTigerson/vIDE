import { ipcMain, app, BrowserWindow } from 'electron'
import { readFile, writeFile, mkdir, access, readdir } from 'fs/promises'
import { join } from 'path'
import { execFile } from 'child_process'
import { readTodosData, writeTodosData } from './todosStore'
import type { TodosData, TodoProject, Todo } from './todosStore'

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
    execFile('git', args, { timeout: opts.timeout, cwd: opts.cwd, encoding: 'utf8' }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout as string)
    })
  })
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

function buildAuthUrl(repoUrl: string, token: string): string {
  // new URL() throws on malformed input — the caller receives a proper error
  // rather than the raw string being interpolated into a command.
  const url = new URL(repoUrl)
  url.username = token
  url.password = ''
  return url.toString()
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

  // ── File-based: notes ──────────────────────────────────────────────────────
  if (categories.notes) {
    try {
      const listing = await runGit(['ls-tree', '--name-only', 'origin/HEAD:notes'], { cwd: repoDir(), timeout: 10000 })
      const noteFiles = listing.trim().split('\n').filter((f) => f.endsWith('.md'))
      const localNotesDir = join(app.getPath('userData'), 'notes')
      await mkdir(localNotesDir, { recursive: true })
      for (const file of noteFiles) {
        const content = await runGit(['show', `origin/HEAD:notes/${file}`], { cwd: repoDir(), timeout: 10000 })
        await writeFile(join(localNotesDir, file), content, 'utf8')
      }
      broadcastNotesChanged()
    } catch { /* no notes directory in remote yet */ }
  }

  return result
}

// Write local settings to the repo and push. Retries up to 3 times on
// non-fast-forward so two machines pushing concurrently always converge.
async function pushSettings(data: Record<string, Record<string, string>>): Promise<void> {
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

    // localStorage-backed categories
    for (const [cat, kvMap] of Object.entries(data)) {
      if (!ALLOWED_CATEGORIES.has(cat)) continue
      await writeFile(join(dir, `${cat}.json`), JSON.stringify(kvMap, null, 2), 'utf8')
    }

    // ── File-based: todos ────────────────────────────────────────────────────
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

    // ── File-based: notes ────────────────────────────────────────────────────
    if ('notes' in data) {
      try {
        const localNotesDir = join(app.getPath('userData'), 'notes')
        const repoNotesDir = join(dir, 'notes')
        await mkdir(repoNotesDir, { recursive: true })
        await mkdir(localNotesDir, { recursive: true })

        const localFiles = await readdir(localNotesDir)
        const localFileSet = new Set(localFiles.filter((f) => f.endsWith('.md')))
        for (const file of localFileSet) {
          const content = await readFile(join(localNotesDir, file), 'utf8')
          await writeFile(join(repoNotesDir, file), content, 'utf8')
        }

        const repoFiles = await readdir(repoNotesDir).catch(() => [] as string[])
        let notesChanged = false
        for (const file of repoFiles) {
          if (!file.endsWith('.md') || localFileSet.has(file)) continue
          const content = await readFile(join(repoNotesDir, file), 'utf8')
          await writeFile(join(localNotesDir, file), content, 'utf8')
          notesChanged = true
        }
        if (notesChanged) broadcastNotesChanged()
      } catch { /* no notes directory yet */ }
    }

    await runGit(['add', '-A'], { cwd: dir })
    try {
      await runGit(['commit', '-m', `vIDE sync ${new Date().toISOString()}`], { cwd: dir })
    } catch { /* nothing changed — clean working tree */ }

    try {
      await runGit(['push', 'origin', 'HEAD'], { cwd: dir, timeout: 30000 })
      return // success
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr ?? ''
      if (attempt < 2 && (stderr.includes('non-fast-forward') || stderr.includes('rejected'))) {
        continue // another machine snuck in a push — re-fetch, re-merge, retry
      }
      throw err
    }
  }
}

export function registerConfigRepoHandlers(): void {
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
    (_e, data: Record<string, Record<string, string>>) => pushSettings(data),
  )
}
