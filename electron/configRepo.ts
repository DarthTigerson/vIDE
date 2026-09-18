import { ipcMain, app } from 'electron'
import { readFile, writeFile, mkdir, access } from 'fs/promises'
import { join } from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

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

function settingsPath(): string {
  return join(app.getPath('userData'), 'config-repo-settings.json')
}

function repoDir(): string {
  return join(app.getPath('userData'), 'config-repo')
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
  try {
    const url = new URL(repoUrl)
    url.username = token
    url.password = ''
    return url.toString()
  } catch {
    return repoUrl
  }
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
    await execAsync(`git -C "${dir}" config user.email`)
  } catch {
    await execAsync(`git -C "${dir}" config user.email "vide-sync@local"`)
    await execAsync(`git -C "${dir}" config user.name "vIDE Sync"`)
  }
}

async function connectRepo(repoUrl: string, token: string): Promise<void> {
  const authUrl = buildAuthUrl(repoUrl, token)
  const dir = repoDir()

  if (await isRepoCloned()) {
    await execAsync(`git -C "${dir}" remote set-url origin "${authUrl}"`)
    await execAsync(`git -C "${dir}" fetch origin`, { timeout: 20000 })
  } else {
    await mkdir(dir, { recursive: true })
    try {
      await execAsync(`git clone "${authUrl}" "${dir}"`, { timeout: 60000 })
    } catch (err) {
      const msg = (err as { stderr?: string }).stderr ?? ''
      if (msg.includes('empty repository') || msg.includes('nothing to clone') || msg.includes('warning: You appear')) {
        await execAsync(`git -C "${dir}" init`)
        await execAsync(`git -C "${dir}" remote add origin "${authUrl}"`)
      } else {
        throw err
      }
    }
  }
  await ensureGitUserConfig()
}

async function readRemoteCategoryFile(category: string): Promise<Record<string, string> | null> {
  const dir = repoDir()
  try {
    const { stdout } = await execAsync(
      `git -C "${dir}" show origin/HEAD:${category}.json`,
      { timeout: 10000 }
    )
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

// Fetch remote and return its current settings. Never writes locally.
async function pullSettings(
  categories: Record<string, boolean>,
): Promise<Record<string, Record<string, string>>> {
  if (!await isRepoCloned()) throw new Error('Repository not connected.')
  await ensureGitUserConfig()
  try {
    await execAsync(`git -C "${repoDir()}" fetch origin`, { timeout: 20000 })
  } catch { /* offline */ }

  const result: Record<string, Record<string, string>> = {}
  for (const [cat, enabled] of Object.entries(categories)) {
    if (!enabled) continue
    const data = await readRemoteCategoryFile(cat)
    if (data) result[cat] = data
  }
  return result
}

// Write local settings to the repo and push. Remote becomes source of truth.
async function pushSettings(data: Record<string, Record<string, string>>): Promise<void> {
  const dir = repoDir()
  if (!await isRepoCloned()) return
  await ensureGitUserConfig()

  // Fetch + reset to remote so our push is always a fast-forward.
  try {
    await execAsync(`git -C "${dir}" fetch origin`, { timeout: 20000 })
  } catch { /* offline */ }
  try {
    await execAsync(`git -C "${dir}" reset --hard origin/HEAD`, { timeout: 10000 })
  } catch { /* no remote HEAD yet — empty repo */ }

  await mkdir(dir, { recursive: true })
  for (const [cat, kvMap] of Object.entries(data)) {
    await writeFile(join(dir, `${cat}.json`), JSON.stringify(kvMap, null, 2), 'utf8')
  }

  await execAsync(`git -C "${dir}" add -A`)
  try {
    await execAsync(`git -C "${dir}" commit -m "vIDE sync ${new Date().toISOString()}"`)
  } catch { /* nothing changed */ }
  await execAsync(`git -C "${dir}" push origin HEAD`, { timeout: 30000 })
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
