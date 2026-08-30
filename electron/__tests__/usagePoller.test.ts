import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }))

vi.mock('child_process', () => {
  function execFile(...args: unknown[]) {
    return execFileMock(...args)
  }
  // usagePoller.ts calls this through util.promisify, which only resolves to
  // { stdout, stderr } (rather than the array node's generic promisify would
  // produce for a 2-value callback) if the function carries this symbol —
  // exactly like the real child_process.execFile does.
  ;(execFile as unknown as Record<symbol, unknown>)[promisify.custom] = (
    file: string,
    args: string[],
    options?: unknown
  ) =>
    new Promise((resolve, reject) => {
      execFileMock(file, args, options, (err: Error | null, stdout: string, stderr: string) => {
        if (err) reject(err)
        else resolve({ stdout, stderr })
      })
    })
  return { execFile }
})

import {
  parseUsageText,
  parseResetAt,
  downsample,
  computeBurnRate,
  computeCutoff,
  UsagePoller,
  ALLOWED_INTERVALS_MS,
  type UsageSnapshot,
} from '../usagePoller'
import { _resetClaudePathCacheForTesting } from '../autocomplete'

const SAMPLE_RESULT = `You are currently using your subscription to power your Claude Code usage

Current session: 0% used · resets Aug 7 at 4:20am (Europe/Malta)
Current week (all models): 9% used · resets Aug 13 at 10am (Europe/Malta)

What's contributing to your limits usage?
Approximate, based on local sessions on this machine.

Last 24h · 1379 requests · 7 sessions
  Top skills: /superpowers:writing-plans 2%, /run 2%

Last 7d · 1845 requests · 8 sessions
  Top skills: /superpowers:brainstorming 3%, /run 2%`

describe('parseResetAt', () => {
  it('parses a reset line into a local-time epoch', () => {
    const now = new Date(2026, 7, 6, 12, 0) // Aug 6, 2026, noon
    const ts = parseResetAt('Current session: 0% used · resets Aug 7 at 4:20am (Europe/Malta)', now)
    expect(ts).toBe(new Date(2026, 7, 7, 4, 20).getTime())
  })

  it('rolls to next year across a year boundary', () => {
    const now = new Date(2026, 11, 30, 12, 0) // Dec 30, 2026
    const ts = parseResetAt('resets Jan 2 at 9:00am (Europe/Malta)', now)
    expect(ts).toBe(new Date(2027, 0, 2, 9, 0).getTime())
  })

  it('returns null when there is no reset line', () => {
    expect(parseResetAt(undefined)).toBeNull()
    expect(parseResetAt('Current session: 0% used')).toBeNull()
  })
})

describe('parseUsageText', () => {
  it('extracts percentages, requests, skills, and reset timestamps', () => {
    const now = new Date(2026, 7, 6, 12, 0)
    const parsed = parseUsageText(SAMPLE_RESULT, now)
    expect(parsed).toMatchObject({
      sessionPct: 0,
      weeklyPct: 9,
      requests24h: 1379,
      requests7d: 1845,
      topSkills: [
        { name: 'superpowers:writing-plans', pct: 2 },
        { name: 'run', pct: 2 },
      ],
    })
    expect(parsed?.sessionResetAt).toBe(new Date(2026, 7, 7, 4, 20).getTime())
    expect(parsed?.weeklyResetAt).toBe(new Date(2026, 7, 13, 10, 0).getTime())
  })

  it('returns null when there is no session line at all', () => {
    expect(parseUsageText('nothing useful here')).toBeNull()
  })
})

describe('computeBurnRate', () => {
  it('computes pct-per-hour from elapsed time in the window', () => {
    const resetAt = Date.now() + 3 * 3_600_000 // 3h remaining of a 5h window -> 2h elapsed
    expect(computeBurnRate(10, resetAt, 5)).toBeCloseTo(5, 5)
  })

  it('returns null with no reset time', () => {
    expect(computeBurnRate(10, null, 5)).toBeNull()
  })

  it('guards against a spike in the first few minutes of a window', () => {
    const resetAt = Date.now() + (5 * 3_600_000 - 60_000) // only 1 minute elapsed
    expect(computeBurnRate(10, resetAt, 5)).toBeNull()
  })
})

describe('computeCutoff', () => {
  const now = new Date(2026, 7, 6, 12, 0).getTime() // Aug 6, 2026, noon

  it('returns null when there is no burn rate', () => {
    expect(computeCutoff(50, null, null, now)).toBeNull()
  })

  it('returns null when the rate is zero or negative', () => {
    expect(computeCutoff(50, null, 0, now)).toBeNull()
    expect(computeCutoff(50, null, -1, now)).toBeNull()
  })

  it('projects forward from the current pct at the given rate', () => {
    // 50% used, climbing 10%/hr -> 5h to reach 100%
    expect(computeCutoff(50, null, 10, now)).toBe(now + 5 * 3_600_000)
  })

  it('returns null when the reset happens before the projected cutoff (on track)', () => {
    // Cutoff is 5h out, but the window resets in 3h -> never actually hits 100%
    const resetAt = now + 3 * 3_600_000
    expect(computeCutoff(50, resetAt, 10, now)).toBeNull()
  })

  it('returns the projected cutoff when it lands before the reset', () => {
    const resetAt = now + 10 * 3_600_000
    expect(computeCutoff(50, resetAt, 10, now)).toBe(now + 5 * 3_600_000)
  })

  it('treats pct at or above 100 as already at cutoff', () => {
    expect(computeCutoff(100, null, 10, now)).toBe(now)
    expect(computeCutoff(103, null, 10, now)).toBe(now)
  })
})

describe('downsample', () => {
  function snap(i: number): UsageSnapshot {
    return { ts: i, sessionPct: i, weeklyPct: i, requests24h: i, requests7d: i, topSkills: [], sessionResetAt: null, weeklyResetAt: null }
  }

  it('leaves a series at or under maxPoints unchanged', () => {
    const snaps = [snap(1), snap(2), snap(3)]
    expect(downsample(snaps, 5)).toEqual(snaps)
  })

  it('buckets a longer series down to maxPoints', () => {
    const snaps = Array.from({ length: 10 }, (_, i) => snap(i))
    const result = downsample(snaps, 5)
    expect(result).toHaveLength(5)
  })

  it('does not blend snapshots from opposite sides of a real time gap into one bucket', () => {
    // Two dense clusters (vIDE running) separated by a long gap (vIDE
    // closed) — bucketing by array index would land some of each cluster in
    // the same middle bucket and average a 0%-ish reading with a 100%-ish
    // one into a fake ~50% point sitting in the middle of the gap.
    const before = Array.from({ length: 10 }, (_, i): UsageSnapshot => ({
      ts: i * 1000,
      sessionPct: 0,
      weeklyPct: 0,
      requests24h: 0,
      requests7d: 0,
      topSkills: [],
      sessionResetAt: null,
      weeklyResetAt: null,
    }))
    const gapStart = 9000
    const after = Array.from({ length: 10 }, (_, i): UsageSnapshot => ({
      ts: gapStart + 6 * 3_600_000 + i * 1000,
      sessionPct: 100,
      weeklyPct: 100,
      requests24h: 0,
      requests7d: 0,
      topSkills: [],
      sessionResetAt: null,
      weeklyResetAt: null,
    }))
    const result = downsample([...before, ...after], 5)
    expect(result.every((s) => s.sessionPct === 0 || s.sessionPct === 100)).toBe(true)
  })
})

describe('UsagePoller', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  function newPoller() {
    dir = mkdtempSync(join(tmpdir(), 'vide-usage-test-'))
    return new UsagePoller(join(dir, 'history.jsonl'), join(dir, 'settings.json'))
  }

  it('defaults to a 60s interval with no settings file', () => {
    const poller = newPoller()
    expect(poller.getIntervalMs()).toBe(60_000)
  })

  it('rejects an interval outside the allowed presets', () => {
    const poller = newPoller()
    expect(poller.setIntervalMs(12_345)).toBe(false)
    expect(poller.getIntervalMs()).toBe(60_000)
  })

  it('persists the interval across instances', () => {
    const poller = newPoller()
    expect(ALLOWED_INTERVALS_MS).toContain(300_000)
    expect(poller.setIntervalMs(300_000)).toBe(true)
    expect(poller.getIntervalMs()).toBe(300_000)

    const reloaded = new UsagePoller(join(dir, 'history.jsonl'), join(dir, 'settings.json'))
    expect(reloaded.getIntervalMs()).toBe(300_000)
  })

  it('getRange filters by timestamp and downsamples', () => {
    const poller = newPoller()
    const historyFile = join(dir, 'history.jsonl')
    const lines = Array.from({ length: 20 }, (_, i): UsageSnapshot => ({
      ts: i * 1000,
      sessionPct: i,
      weeklyPct: i,
      requests24h: 0,
      requests7d: 0,
      topSkills: [],
      sessionResetAt: null,
      weeklyResetAt: null,
    }))
    writeFileSync(historyFile, lines.map((l) => JSON.stringify(l)).join('\n') + '\n')

    const inRange = poller.getRange(5000, 14000, 100)
    expect(inRange.every((s) => s.ts >= 5000 && s.ts <= 14000)).toBe(true)
    expect(inRange).toHaveLength(10)

    const downsampled = poller.getRange(0, 19000, 4)
    expect(downsampled).toHaveLength(4)
  })

  it('getRange returns an empty array when there is no history yet', () => {
    const poller = newPoller()
    expect(poller.getRange(0, Date.now())).toEqual([])
  })

  it('getLatest returns null before any poll', () => {
    const poller = newPoller()
    expect(poller.getLatest()).toBeNull()
  })
})

describe('UsagePoller.poll', () => {
  let dir: string

  beforeEach(() => {
    execFileMock.mockReset()
    _resetClaudePathCacheForTesting()
  })

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  function newPoller() {
    dir = mkdtempSync(join(tmpdir(), 'vide-usage-poll-test-'))
    return new UsagePoller(join(dir, 'history.jsonl'), join(dir, 'settings.json'))
  }

  function lastArg(call: unknown[]) {
    return call[call.length - 1] as (err: Error | null, stdout: string, stderr?: string) => void
  }

  it('resolves claude via an interactive login shell, then spawns the resolved path directly', async () => {
    // A bare non-interactive `-lc` login shell doesn't source ~/.zshrc, so it
    // can miss PATH entries added by nvm/etc — the exact bug this regression
    // test guards against. Every other claude-CLI call site in this codebase
    // (autocomplete, commitMessage, graphify) resolves via the interactive
    // `-lic` form for this reason; the poller must match.
    execFileMock.mockImplementation((...call: unknown[]) => {
      const [file, args] = call as [string, unknown]
      const cb = lastArg(call)
      if (Array.isArray(args) && args.includes('command -v claude')) {
        cb(null, '/Users/thomas/.local/bin/claude', '')
        return
      }
      if (file === '/Users/thomas/.local/bin/claude') {
        cb(null, JSON.stringify({ result: SAMPLE_RESULT }), '')
        return
      }
      cb(new Error(`unexpected execFile call: ${JSON.stringify(call.slice(0, 2))}`), '', '')
    })

    const poller = newPoller()
    await poller.poll()

    const pathResolveCall = execFileMock.mock.calls.find(
      (c) => Array.isArray(c[1]) && (c[1] as unknown[]).includes('command -v claude')
    )
    expect(pathResolveCall?.[1]).toContain('-lic')

    const usageCall = execFileMock.mock.calls.find((c) => c[0] === '/Users/thomas/.local/bin/claude')
    expect(usageCall?.[1]).toEqual(['/usage', '--output-format', 'json'])

    expect(poller.getLatest()?.sessionPct).toBe(0)
  })

  it('does not attempt the usage call when claude cannot be resolved on PATH', async () => {
    execFileMock.mockImplementation((...call: unknown[]) => lastArg(call)(new Error('not found'), '', ''))

    const poller = newPoller()
    await poller.poll()

    expect(poller.getLatest()).toBeNull()
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })
})
