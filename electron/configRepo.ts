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

export interface SyncResult {
  merged: Record<string, Record<string, string>>
  hasConflicts: boolean
  conflicts: Record<string, ConflictEntry>
  pushFailed?: boolean
  pushError?: string
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

function baselinePath(): string {
  return join(app.getPath('userData'), 'config-repo-baseline.json')
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

async function readBaseline(): Promise<Record<string, Record<string, string>>> {
  try {
    const raw = await readFile(baselinePath(), 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function saveBaseline(data: Record<string, Record<string, string>>): Promise<void> {
  await writeFile(baselinePath(), JSON.stringify(data), 'utf8')
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

// On first sync (no baseline) with existing remote content — remote wins for
// keys it knows about, local fills in any keys the remote doesn't have yet.
// This is the "new machine joining" scenario.
function firstSyncMerge(
  local: Record<string, Record<string, string>>,
  remote: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  const merged: Record<string, Record<string, string>> = {}
  const allCats = new Set([...Object.keys(local), ...Object.keys(remote)])
  for (const cat of allCats) {
    merged[cat] = { ...(local[cat] ?? {}), ...(remote[cat] ?? {}) }
  }
  return merged
}

// Three-way merge using the last-synced baseline to detect which side changed.
// Only keys where BOTH sides diverged from the baseline are real conflicts.
function threeWayMerge(
  local: Record<string, Record<string, string>>,
  remote: Record<string, Record<string, string>>,
  baseline: Record<string, Record<string, string>>,
): { merged: Record<string, Record<string, string>>; conflicts: Record<string, ConflictEntry>; hasConflicts: boolean } {
  const merged: Record<string, Record<string, string>> = {}
  const conflicts: Record<string, ConflictEntry> = {}

  const allCats = new Set([...Object.keys(local), ...Object.keys(remote)])
  for (const cat of allCats) {
    const localKv = local[cat] ?? {}
    const remoteKv = remote[cat] ?? {}
    const baseKv = baseline[cat] ?? {}

    const allKeys = new Set([...Object.keys(localKv), ...Object.keys(remoteKv), ...Object.keys(baseKv)])
    const mergedKv: Record<string, string> = {}
    const conflictKeys: string[] = []

    for (const key of allKeys) {
      const lv = localKv[key]
      const rv = remoteKv[key]
      const bv = baseKv[key]

      if (lv === rv) {
        if (lv !== undefined) mergedKv[key] = lv
      } else if (lv === bv) {
        // Only remote changed — take remote silently
        if (rv !== undefined) mergedKv[key] = rv
      } else if (rv === bv) {
        // Only local changed — keep local
        if (lv !== undefined) mergedKv[key] = lv
      } else {
        // Both changed differently — real conflict
        conflictKeys.push(key)
        if (lv !== undefined) mergedKv[key] = lv // temp; overridden after resolution
      }
    }

    merged[cat] = mergedKv
    if (conflictKeys.length > 0) {
      conflicts[cat] = { category: cat, localData: localKv, remoteData: remoteKv, diffKeys: conflictKeys }
    }
  }

  return { merged, conflicts, hasConflicts: Object.keys(conflicts).length > 0 }
}

async function pushMergedFiles(
  dir: string,
  data: Record<string, Record<string, string>>,
): Promise<void> {
  // Reset to latest remote tip so we can fast-forward push without force
  try {
    await execAsync(`git -C "${dir}" reset --hard origin/HEAD`, { timeout: 10000 })
  } catch {
    // No remote HEAD yet (empty repo) — that's fine, just write into the empty tree
  }

  await mkdir(dir, { recursive: true })
  for (const [cat, kvMap] of Object.entries(data)) {
    await writeFile(join(dir, `${cat}.json`), JSON.stringify(kvMap, null, 2), 'utf8')
  }

  await execAsync(`git -C "${dir}" add -A`)
  try {
    await execAsync(`git -C "${dir}" commit -m "vIDE sync ${new Date().toISOString()}"`)
  } catch {
    // Nothing changed since last commit — silently skip
  }
  await execAsync(`git -C "${dir}" push origin HEAD`, { timeout: 30000 })
}

async function syncRepo(localData: Record<string, Record<string, string>>): Promise<SyncResult> {
  const dir = repoDir()
  if (!await isRepoCloned()) throw new Error('Repository not connected. Please connect first.')

  await ensureGitUserConfig()

  // Fetch latest from remote (best-effort — we can still work offline)
  try {
    await execAsync(`git -C "${dir}" fetch origin`, { timeout: 20000 })
  } catch { /* offline */ }

  // Read each category file from remote's fetched HEAD
  const remoteData: Record<string, Record<string, string>> = {}
  for (const cat of Object.keys(localData)) {
    const rv = await readRemoteCategoryFile(cat)
    if (rv) remoteData[cat] = rv
  }

  const baseline = await readBaseline()
  const isFirstSync = Object.keys(baseline).length === 0
  const remoteHasContent = Object.keys(remoteData).length > 0

  let merged: Record<string, Record<string, string>>
  let conflicts: Record<string, ConflictEntry> = {}
  let hasConflicts = false

  if (isFirstSync && remoteHasContent) {
    // New machine joining — silently import remote, no conflict modal
    merged = firstSyncMerge(localData, remoteData)
  } else {
    const result = threeWayMerge(localData, remoteData, baseline)
    merged = result.merged
    conflicts = result.conflicts
    hasConflicts = result.hasConflicts
  }

  if (hasConflicts) {
    // Return without writing — renderer resolves, then calls applyResolved
    return { merged, hasConflicts: true, conflicts }
  }

  // Push is best-effort: local settings apply regardless of network/auth failures.
  // The next scheduled sync will retry the push.
  let pushFailed = false
  let pushError: string | undefined
  try {
    await pushMergedFiles(dir, merged)
  } catch (e) {
    pushFailed = true
    pushError = (e as Error).message
  }
  await saveBaseline(merged)
  return { merged, hasConflicts: false, conflicts: {}, pushFailed, pushError }
}

async function applyResolved(resolvedData: Record<string, Record<string, string>>): Promise<void> {
  const dir = repoDir()
  await ensureGitUserConfig()
  await pushMergedFiles(dir, resolvedData)
  await saveBaseline(resolvedData)
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
    'configRepo:sync',
    (_e, localData: Record<string, Record<string, string>>) => syncRepo(localData)
  )

  ipcMain.handle(
    'configRepo:applyResolved',
    (_e, resolvedData: Record<string, Record<string, string>>) => applyResolved(resolvedData)
  )
}
