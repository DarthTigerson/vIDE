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
  saveRateMinutes: number
}

export interface ConflictEntry {
  category: string
  localData: Record<string, string>
  remoteData: Record<string, string>
  diffKeys: string[]
}

export interface ConflictCheckResult {
  hasConflicts: boolean
  conflicts: Record<string, ConflictEntry>
}

const DEFAULT_SETTINGS: ConfigRepoSettings = {
  enabled: false,
  repoUrl: '',
  token: '',
  categories: {
    general: true, models: true, git: true, docker: true,
    integrations: true, notes: true, todo: true, jira: true,
  },
  saveRateMinutes: 5,
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
      // Clone fails on empty repos — init locally instead
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

async function checkConflicts(
  localData: Record<string, Record<string, string>>
): Promise<ConflictCheckResult> {
  if (!await isRepoCloned()) {
    return { hasConflicts: false, conflicts: {} }
  }

  // Fetch latest remote state before comparing
  const dir = repoDir()
  try {
    await execAsync(`git -C "${dir}" fetch origin`, { timeout: 20000 })
  } catch {
    // If fetch fails, proceed without remote comparison
    return { hasConflicts: false, conflicts: {} }
  }

  const conflicts: Record<string, ConflictEntry> = {}

  for (const [category, localKv] of Object.entries(localData)) {
    const remoteKv = await readRemoteCategoryFile(category)
    if (!remoteKv) continue // no remote file yet → no conflict

    const allKeys = new Set([...Object.keys(localKv), ...Object.keys(remoteKv)])
    const diffKeys = [...allKeys].filter((k) => localKv[k] !== remoteKv[k])

    if (diffKeys.length > 0) {
      conflicts[category] = { category, localData: localKv, remoteData: remoteKv, diffKeys }
    }
  }

  return { hasConflicts: Object.keys(conflicts).length > 0, conflicts }
}

async function syncRepo(resolvedData: Record<string, Record<string, string>>): Promise<void> {
  const dir = repoDir()

  if (!await isRepoCloned()) {
    throw new Error('Repository not connected. Please connect first.')
  }

  await ensureGitUserConfig()
  await mkdir(dir, { recursive: true })

  for (const [category, kvMap] of Object.entries(resolvedData)) {
    await writeFile(join(dir, `${category}.json`), JSON.stringify(kvMap, null, 2), 'utf8')
  }

  await execAsync(`git -C "${dir}" add -A`)
  try {
    await execAsync(
      `git -C "${dir}" commit -m "vIDE sync ${new Date().toISOString()}"`,
      { timeout: 15000 }
    )
  } catch {
    // Nothing to commit — remote is already in sync
  }
  await execAsync(`git -C "${dir}" push --force-with-lease origin HEAD`, { timeout: 30000 })
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
    'configRepo:checkConflicts',
    (_e, localData: Record<string, Record<string, string>>) => checkConflicts(localData)
  )

  ipcMain.handle(
    'configRepo:sync',
    (_e, resolvedData: Record<string, Record<string, string>>) => syncRepo(resolvedData)
  )
}
