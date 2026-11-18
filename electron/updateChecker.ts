import { ipcMain } from 'electron'

const REPO = 'DarthTigerson/vIDE'
// Hourly, so an urgent release shows up within the hour and lines up with
// the urgent notification's one-hour Snooze. Well under GitHub's 60/hour
// unauthenticated limit.
const CHECK_INTERVAL_MS = 60 * 60 * 1000
// Enough releases to cover anyone a few months behind.
const RELEASES_PER_PAGE = 20

// How hard vIDE pushes an update, from a marker in the release notes:
//   <!-- vide-update: severity=urgent -->    pinned red notification, Snooze only
//   <!-- vide-update: severity=critical -->  as urgent, then the Update required
//                                             wall on the next launch
// No marker means normal.
export type UpdateSeverity = 'normal' | 'urgent' | 'critical'

export interface UpdateInfo {
  version: string
  url: string
  // The highest severity of every release newer than the installed version,
  // so an urgent release isn't hidden by a normal one published after it.
  severity: UpdateSeverity
}

// What Settings > About shows next to Check for updates (VIDE-143).
export interface UpdateCheckStatus {
  latest: UpdateInfo | null
  // When the last check that actually reached GitHub finished, or null.
  lastCheckedAt: number | null
  // Whether the most recent check failed (offline, rate-limited, …).
  failed: boolean
}

export interface GithubRelease {
  tag_name: string
  html_url: string
  draft: boolean
  prerelease: boolean
  body?: string | null
}

const SEVERITY_RANK: Record<UpdateSeverity, number> = { normal: 0, urgent: 1, critical: 2 }
const SEVERITY_MARKER = /<!--\s*vide-update:\s*severity=(urgent|critical)\s*-->/i

export function parseSeverity(body: string | null | undefined): UpdateSeverity {
  const match = body?.match(SEVERITY_MARKER)
  return match ? (match[1].toLowerCase() as UpdateSeverity) : 'normal'
}

// Picks the newest release above currentVersion and the highest severity
// among all of them, or null when nothing newer is published.
export function pendingUpdate(releases: GithubRelease[], currentVersion: string): UpdateInfo | null {
  let latest: UpdateInfo | null = null
  let severity: UpdateSeverity = 'normal'
  for (const release of releases) {
    if (release.draft || release.prerelease) continue
    const version = release.tag_name.replace(/^v/, '')
    if (compareVersions(version, currentVersion) <= 0) continue
    const s = parseSeverity(release.body)
    if (SEVERITY_RANK[s] > SEVERITY_RANK[severity]) severity = s
    if (!latest || compareVersions(version, latest.version) > 0) latest = { version, url: release.html_url, severity: 'normal' }
  }
  return latest ? { ...latest, severity } : null
}

// Compares two dotted-numeric versions (e.g. "0.2.0" vs "0.1.0").
// Returns >0 if a is newer, <0 if b is newer, 0 if equal.
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export class UpdateChecker {
  private latest: UpdateInfo | null = null
  private interval: ReturnType<typeof setInterval> | null = null
  private lastCheckedAt: number | null = null
  private lastCheckFailed = false

  constructor(
    private readonly currentVersion: string,
    private readonly onUpdate?: (info: UpdateInfo | null) => void
  ) {}

  async check(): Promise<UpdateInfo | null> {
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=${RELEASES_PER_PAGE}`, {
        headers: { Accept: 'application/vnd.github+json' },
      })
      if (!res.ok) {
        this.lastCheckFailed = true
        return this.latest
      }
      const releases: unknown = await res.json()
      if (!Array.isArray(releases)) {
        this.lastCheckFailed = true
        return this.latest
      }
      this.lastCheckedAt = Date.now()
      this.lastCheckFailed = false

      const next = pendingUpdate(releases as GithubRelease[], this.currentVersion)
      if (next?.version !== this.latest?.version || next?.severity !== this.latest?.severity) {
        this.latest = next
        this.onUpdate?.(this.latest)
      }
      return this.latest
    } catch (e) {
      console.error('UpdateChecker check failed:', e)
      this.lastCheckFailed = true
      return this.latest
    }
  }

  start(): void {
    if (this.interval) return
    void this.check()
    this.interval = setInterval(() => void this.check(), CHECK_INTERVAL_MS)
  }

  stop(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null }
  }

  getLatest(): UpdateInfo | null {
    return this.latest
  }

  getStatus(): UpdateCheckStatus {
    return { latest: this.latest, lastCheckedAt: this.lastCheckedAt, failed: this.lastCheckFailed }
  }

  registerHandlers(): void {
    ipcMain.handle('update:getLatest', () => this.getLatest())
    ipcMain.handle('update:getStatus', () => this.getStatus())
    // "Check for updates" in Settings > About: check now, report the outcome.
    ipcMain.handle('update:check', async () => {
      await this.check()
      return this.getStatus()
    })
  }
}
