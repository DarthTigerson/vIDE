import { readdirSync, statSync, openSync, closeSync, readSync } from 'fs'
import { join } from 'path'

// Anthropic per-model pricing ($ per million tokens), verified against
// platform.claude.com/docs/en/about-claude/pricing. Cache write/read are
// multipliers of a model's own base input rate (1.25x for a 5-minute write,
// 2x for a 1-hour write, 0.1x for a cache-read hit) — baked in here as
// absolute $/MTok rather than recomputed from the multiplier each time, so
// this table can be diffed directly against the pricing page.
interface ModelRates {
  input: number
  cacheWrite5m: number
  cacheWrite1h: number
  cacheRead: number
  output: number
}

const MODEL_RATES: Record<string, ModelRates> = {
  'claude-fable-5': { input: 10, cacheWrite5m: 12.5, cacheWrite1h: 20, cacheRead: 1, output: 50 },
  'claude-mythos-5': { input: 10, cacheWrite5m: 12.5, cacheWrite1h: 20, cacheRead: 1, output: 50 },
  'claude-opus-5': { input: 5, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5, output: 25 },
  'claude-opus-4-8': { input: 5, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5, output: 25 },
  'claude-opus-4-7': { input: 5, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5, output: 25 },
  'claude-opus-4-6': { input: 5, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5, output: 25 },
  'claude-opus-4-5': { input: 5, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5, output: 25 },
  'claude-opus-4-1': { input: 15, cacheWrite5m: 18.75, cacheWrite1h: 30, cacheRead: 1.5, output: 75 },
  'claude-opus-4': { input: 15, cacheWrite5m: 18.75, cacheWrite1h: 30, cacheRead: 1.5, output: 75 },
  'claude-sonnet-5': { input: 2, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2, output: 10 },
  'claude-sonnet-4-6': { input: 3, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3, output: 15 },
  'claude-sonnet-4-5': { input: 3, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3, output: 15 },
  'claude-sonnet-4': { input: 3, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3, output: 15 },
  'claude-haiku-4-5': { input: 1, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1, output: 5 },
  'claude-haiku-3-5': { input: 0.8, cacheWrite5m: 1, cacheWrite1h: 1.6, cacheRead: 0.08, output: 4 },
}

// Session transcripts sometimes carry a dated snapshot id (e.g.
// "claude-haiku-4-5-20251001") rather than the bare model id the pricing
// table is keyed by — strip a trailing "-YYYYMMDD" so both forms resolve to
// the same rates.
export function normalizeModelId(model: string): string {
  return model.replace(/-\d{8}$/, '')
}

export interface RawTokenUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  cache_creation?: {
    ephemeral_5m_input_tokens?: number
    ephemeral_1h_input_tokens?: number
  }
}

// Pure pricing calculation for one assistant message's token usage. Returns
// null for a model this table doesn't recognize, rather than silently
// under-pricing it as $0.
export function estimateMessageCostUsd(model: string, usage: RawTokenUsage): number | null {
  const rates = MODEL_RATES[normalizeModelId(model)]
  if (!rates) return null

  const perTok = (tokens: number | undefined, dollarsPerMTok: number) => ((tokens ?? 0) / 1_000_000) * dollarsPerMTok

  let cost = perTok(usage.input_tokens, rates.input)
  cost += perTok(usage.output_tokens, rates.output)
  cost += perTok(usage.cache_read_input_tokens, rates.cacheRead)

  if (usage.cache_creation) {
    cost += perTok(usage.cache_creation.ephemeral_5m_input_tokens, rates.cacheWrite5m)
    cost += perTok(usage.cache_creation.ephemeral_1h_input_tokens, rates.cacheWrite1h)
  } else if (usage.cache_creation_input_tokens) {
    // Pre-breakdown transcripts only report a single combined cache-write
    // figure with no way to tell which TTL wrote it — treat it as the more
    // common 5-minute rate rather than drop it from the estimate entirely.
    cost += perTok(usage.cache_creation_input_tokens, rates.cacheWrite5m)
  }

  return cost
}

interface CostEntry {
  ts: number
  costUsd: number
}

const WEEKLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

// Incremental tail-scanner over ~/.claude/projects/**/*.jsonl. Session
// transcripts on a machine with any real history run into the hundreds of
// megabytes, so re-reading everything on every poll would be wasteful —
// each file's already-consumed byte offset is cached in memory, and a poll
// only reads the bytes appended since the last one. Entries older than the
// weekly window (the widest window anything queries) are pruned so memory
// stays bounded regardless of how long the process has been running.
export class SpendTracker {
  private offsets = new Map<string, number>()
  private entries: CostEntry[] = []

  constructor(private readonly projectsRoot: string) {}

  private listTranscriptFiles(): string[] {
    let projectDirs: string[]
    try {
      projectDirs = readdirSync(this.projectsRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => join(this.projectsRoot, d.name))
    } catch {
      return []
    }
    const files: string[] = []
    for (const dir of projectDirs) {
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(join(dir, entry.name))
        }
      } catch {
        // Unreadable/removed project directory — skip it, keep scanning the rest.
      }
    }
    return files
  }

  private parseLine(line: string): void {
    let obj: unknown
    try {
      obj = JSON.parse(line)
    } catch {
      return
    }
    if (!obj || typeof obj !== 'object') return
    const message = (obj as Record<string, unknown>).message
    if (!message || typeof message !== 'object') return
    const model = (message as Record<string, unknown>).model
    const usage = (message as Record<string, unknown>).usage
    if (typeof model !== 'string' || !usage || typeof usage !== 'object') return

    const timestamp = (obj as Record<string, unknown>).timestamp
    const ts = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN
    if (!Number.isFinite(ts)) return

    const costUsd = estimateMessageCostUsd(model, usage as RawTokenUsage)
    if (costUsd == null) return
    this.entries.push({ ts, costUsd })
  }

  private refresh(now: number): void {
    for (const file of this.listTranscriptFiles()) {
      let stat
      try {
        stat = statSync(file)
      } catch {
        continue
      }
      // A file untouched since before the widest window we ever query can't
      // contribute an entry any query would still want — skip it entirely
      // rather than pay for an offset-tracked read that prune() would just
      // discard on the next line.
      if (stat.mtimeMs < now - WEEKLY_WINDOW_MS) continue

      const prevOffset = this.offsets.get(file) ?? 0
      if (stat.size <= prevOffset) continue

      const length = stat.size - prevOffset
      const buf = Buffer.alloc(length)
      const fd = openSync(file, 'r')
      try {
        readSync(fd, buf, 0, length, prevOffset)
      } finally {
        closeSync(fd)
      }

      const text = buf.toString('utf-8')
      const lastNewline = text.lastIndexOf('\n')
      // A transcript can be mid-append — only consume up through the last
      // complete line, and re-read the trailing partial line next time.
      const complete = lastNewline === -1 ? '' : text.slice(0, lastNewline + 1)
      this.offsets.set(file, prevOffset + Buffer.byteLength(complete, 'utf-8'))

      for (const line of complete.split('\n')) {
        if (line) this.parseLine(line)
      }
    }

    const cutoff = now - WEEKLY_WINDOW_MS
    if (this.entries.length > 0 && this.entries[0].ts < cutoff) {
      this.entries = this.entries.filter((e) => e.ts >= cutoff)
    }
  }

  // sessionWindowStartTs/weeklyWindowStartTs are absolute epoch bounds
  // (null when the caller has no reset time to anchor a window to) —
  // computing them is the poller's job, this just sums whatever range it's given.
  computeSpend(
    sessionWindowStartTs: number | null,
    weeklyWindowStartTs: number | null,
    now = Date.now()
  ): { sessionSpendUsd: number; weeklySpendUsd: number } {
    this.refresh(now)
    const sum = (fromTs: number) => this.entries.reduce((s, e) => (e.ts >= fromTs ? s + e.costUsd : s), 0)
    return {
      sessionSpendUsd: sessionWindowStartTs != null ? sum(sessionWindowStartTs) : 0,
      weeklySpendUsd: weeklyWindowStartTs != null ? sum(weeklyWindowStartTs) : 0,
    }
  }
}
