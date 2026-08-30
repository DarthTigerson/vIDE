import { execFile } from 'child_process'
import { promisify } from 'util'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { resolveClaudePath } from './autocomplete'

const execFileAsync = promisify(execFile)

export interface UsageSnapshot {
  ts: number
  sessionPct: number
  weeklyPct: number
  requests24h: number
  requests7d: number
  topSkills: { name: string; pct: number }[]
  sessionResetAt: number | null
  weeklyResetAt: number | null
}

export interface LatestUsage extends UsageSnapshot {
  sessionAvgRatePerHour: number | null
  weeklyAvgRatePerHour: number | null
  sessionCutoffAt: number | null
  weeklyCutoffAt: number | null
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// The CLI always reports resets in the machine's own local zone (verified:
// Intl.DateTimeFormat().resolvedOptions().timeZone matches the "(Zone/City)"
// it prints), so this can be parsed as a plain local date-time — no
// timezone-conversion library needed.
export function parseResetAt(line: string | undefined, now = new Date()): number | null {
  if (!line) return null
  // Minutes are omitted on the hour ("resets Aug 13 at 10am"), present otherwise ("4:20am").
  const m = line.match(/resets (\w+) (\d+) at (\d+)(?::(\d+))?(am|pm)/i)
  if (!m) return null
  const monthIndex = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase())
  if (monthIndex === -1) return null
  const day = parseInt(m[2], 10)
  let hour = parseInt(m[3], 10) % 12
  if (m[5].toLowerCase() === 'pm') hour += 12
  const minute = m[4] ? parseInt(m[4], 10) : 0

  const year = now.getFullYear()
  let date = new Date(year, monthIndex, day, hour, minute, 0, 0)
  // Reset times are always upcoming. If constructing with the current year
  // lands more than a day in the past, we're straddling a year boundary.
  if (date.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
    date = new Date(year + 1, monthIndex, day, hour, minute, 0, 0)
  }
  return date.getTime()
}

export function parseUsageText(text: string, now = new Date()): Omit<UsageSnapshot, 'ts'> | null {
  const sessionMatch = text.match(/Current session: (\d+)%/)
  if (!sessionMatch) return null

  const sessionLine = text.match(/Current session:[^\n]*/)?.[0]
  const weeklyLine = text.match(/Current week[^\n]*/)?.[0]

  const weeklyMatch = weeklyLine?.match(/: (\d+)%/)
  const req24hMatch = text.match(/Last 24h · (\d+) requests/)
  const req7dMatch = text.match(/Last 7d · (\d+) requests/)

  const topSkills: { name: string; pct: number }[] = []
  const skillsMatch = text.match(/Last 24h[\s\S]*?Top skills: ([^\n]+)/)
  if (skillsMatch) {
    for (const part of skillsMatch[1].split(', ')) {
      const m = part.match(/(.+?)\s+(\d+)%/)
      if (m) topSkills.push({ name: m[1].replace(/^\//, ''), pct: parseInt(m[2]) })
    }
  }

  return {
    sessionPct: parseInt(sessionMatch[1]),
    weeklyPct: weeklyMatch ? parseInt(weeklyMatch[1]) : 0,
    requests24h: req24hMatch ? parseInt(req24hMatch[1]) : 0,
    requests7d: req7dMatch ? parseInt(req7dMatch[1]) : 0,
    topSkills,
    sessionResetAt: parseResetAt(sessionLine, now),
    weeklyResetAt: parseResetAt(weeklyLine, now),
  }
}

const SESSION_WINDOW_HOURS = 5
const WEEKLY_WINDOW_HOURS = 7 * 24
const MIN_ELAPSED_HOURS = 5 / 60 // guard against a wild spike in the first few minutes of a window

export function computeBurnRate(pct: number, resetAt: number | null, windowHours: number): number | null {
  if (resetAt == null) return null
  const hoursRemaining = (resetAt - Date.now()) / 3_600_000
  const elapsed = windowHours - hoursRemaining
  if (elapsed < MIN_ELAPSED_HOURS) return null
  return pct / elapsed
}

// Projects when usage would hit 100% at the current burn rate. Null means
// "no meaningful cutoff": either the rate isn't climbing, or the window
// resets before the projection would ever reach 100% (on track).
export function computeCutoff(pct: number, resetAt: number | null, ratePerHour: number | null, now = Date.now()): number | null {
  if (ratePerHour == null || ratePerHour <= 0) return null
  if (pct >= 100) return now
  const cutoffAt = now + ((100 - pct) / ratePerHour) * 3_600_000
  if (resetAt != null && cutoffAt >= resetAt) return null
  return cutoffAt
}

function averageBucket(bucket: UsageSnapshot[]): UsageSnapshot {
  const last = bucket[bucket.length - 1]
  const avg = (key: 'sessionPct' | 'weeklyPct' | 'requests24h' | 'requests7d') =>
    Math.round(bucket.reduce((s, b) => s + b[key], 0) / bucket.length)
  return {
    ts: last.ts,
    sessionPct: avg('sessionPct'),
    weeklyPct: avg('weeklyPct'),
    requests24h: avg('requests24h'),
    requests7d: avg('requests7d'),
    topSkills: last.topSkills,
    sessionResetAt: last.sessionResetAt,
    weeklyResetAt: last.weeklyResetAt,
  }
}

// Grafana-style trade-off: raw history is kept forever on disk, but a query
// only ever gets back a series sized to what a chart can show — keeps
// responses fast and small no matter how much history has piled up.
//
// Buckets by *time*, not array position: if vIDE (or the machine) was off
// for a stretch, the buckets that fall inside that stretch simply produce no
// point, instead of blending the last pre-gap reading with the first
// post-gap one into a single misleading average. The chart then renders
// that as a real break in the line (see sparkline.ts) rather than a smooth
// diagonal implying continuous usage change.
export function downsample(snapshots: UsageSnapshot[], maxPoints: number): UsageSnapshot[] {
  if (snapshots.length <= maxPoints) return snapshots
  const firstTs = snapshots[0].ts
  const span = snapshots[snapshots.length - 1].ts - firstTs
  if (span <= 0) return [averageBucket(snapshots)]

  const bucketWidth = span / maxPoints
  const buckets: UsageSnapshot[][] = []
  for (const s of snapshots) {
    const idx = Math.min(maxPoints - 1, Math.floor((s.ts - firstTs) / bucketWidth))
    ;(buckets[idx] ??= []).push(s)
  }
  return buckets.filter((b) => b?.length).map(averageBucket)
}

export const ALLOWED_INTERVALS_MS = [15_000, 30_000, 60_000, 300_000, 900_000]
const DEFAULT_INTERVAL_MS = 60_000

export class UsagePoller {
  private latest: UsageSnapshot | null = null
  private interval: ReturnType<typeof setInterval> | null = null
  private intervalMs = DEFAULT_INTERVAL_MS

  constructor(
    private readonly historyFile: string,
    private readonly settingsFile: string,
    private readonly onSnapshot?: (snapshot: UsageSnapshot) => void
  ) {
    this.loadSettings()
  }

  private loadSettings(): void {
    try {
      const raw = JSON.parse(readFileSync(this.settingsFile, 'utf-8'))
      if (ALLOWED_INTERVALS_MS.includes(raw.intervalMs)) this.intervalMs = raw.intervalMs
    } catch { /* no settings file yet, or unreadable — keep default */ }
  }

  private saveSettings(): void {
    try { writeFileSync(this.settingsFile, JSON.stringify({ intervalMs: this.intervalMs })) } catch (e) {
      console.error('UsagePoller settings write failed:', e)
    }
  }

  setIntervalMs(ms: number): boolean {
    if (!ALLOWED_INTERVALS_MS.includes(ms)) return false
    this.intervalMs = ms
    this.saveSettings()
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = setInterval(() => void this.poll(), this.intervalMs)
    }
    return true
  }

  getIntervalMs(): number {
    return this.intervalMs
  }

  async poll(): Promise<void> {
    try {
      const claudePath = await resolveClaudePath()
      if (!claudePath) return
      const { stdout } = await execFileAsync(
        claudePath,
        ['/usage', '--output-format', 'json'],
        { timeout: 15_000 }
      )
      const jsonLine = stdout.split('\n').find((l) => l.trimStart().startsWith('{'))
      if (!jsonLine) return
      const json = JSON.parse(jsonLine)
      const parsed = parseUsageText(json.result ?? '')
      if (!parsed) return
      const snapshot: UsageSnapshot = { ts: Date.now(), ...parsed }
      this.latest = snapshot
      try {
        appendFileSync(this.historyFile, JSON.stringify(snapshot) + '\n')
      } catch (e) {
        console.error('UsagePoller history write failed:', e)
      }
      this.onSnapshot?.(snapshot)
    } catch (e) {
      console.error('UsagePoller poll failed:', e)
    }
  }

  start(): void {
    if (this.interval) return
    void this.poll()
    this.interval = setInterval(() => void this.poll(), this.intervalMs)
  }

  stop(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null }
  }

  getLatest(): LatestUsage | null {
    if (!this.latest) return null
    const sessionAvgRatePerHour = computeBurnRate(this.latest.sessionPct, this.latest.sessionResetAt, SESSION_WINDOW_HOURS)
    const weeklyAvgRatePerHour = computeBurnRate(this.latest.weeklyPct, this.latest.weeklyResetAt, WEEKLY_WINDOW_HOURS)
    return {
      ...this.latest,
      sessionAvgRatePerHour,
      weeklyAvgRatePerHour,
      sessionCutoffAt: computeCutoff(this.latest.sessionPct, this.latest.sessionResetAt, sessionAvgRatePerHour),
      weeklyCutoffAt: computeCutoff(this.latest.weeklyPct, this.latest.weeklyResetAt, weeklyAvgRatePerHour),
    }
  }

  getRange(fromTs: number, toTs: number, maxPoints = 120): UsageSnapshot[] {
    if (!existsSync(this.historyFile)) return []
    const snapshots: UsageSnapshot[] = []
    for (const line of readFileSync(this.historyFile, 'utf-8').split('\n')) {
      if (!line) continue
      try {
        const snap = JSON.parse(line) as UsageSnapshot
        if (snap.ts >= fromTs && snap.ts <= toTs) snapshots.push(snap)
      } catch { /* skip a corrupt line rather than fail the whole read */ }
    }
    return downsample(snapshots, maxPoints)
  }
}
