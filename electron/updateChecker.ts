import { ipcMain } from 'electron'

const REPO = 'DarthTigerson/vIDE'
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export interface UpdateInfo {
  version: string
  url: string
}

interface GithubRelease {
  tag_name: string
  html_url: string
  draft: boolean
  prerelease: boolean
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

  constructor(
    private readonly currentVersion: string,
    private readonly onUpdate?: (info: UpdateInfo | null) => void
  ) {}

  async check(): Promise<UpdateInfo | null> {
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
      })
      if (!res.ok) return this.latest
      const release: GithubRelease = await res.json()
      if (release.draft || release.prerelease) return this.latest

      const version = release.tag_name.replace(/^v/, '')
      const next = compareVersions(version, this.currentVersion) > 0
        ? { version, url: release.html_url }
        : null

      if (next?.version !== this.latest?.version) {
        this.latest = next
        this.onUpdate?.(this.latest)
      }
      return this.latest
    } catch (e) {
      console.error('UpdateChecker check failed:', e)
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

  registerHandlers(): void {
    ipcMain.handle('update:getLatest', () => this.getLatest())
  }
}
