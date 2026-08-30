import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { estimateMessageCostUsd, normalizeModelId, SpendTracker } from '../spendEstimator'

describe('normalizeModelId', () => {
  it('strips a trailing date suffix', () => {
    expect(normalizeModelId('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5')
  })

  it('leaves a bare model id unchanged', () => {
    expect(normalizeModelId('claude-sonnet-5')).toBe('claude-sonnet-5')
  })
})

describe('estimateMessageCostUsd', () => {
  it('prices input and output tokens at a known model\'s base rates', () => {
    // Sonnet 5: $2/MTok input, $10/MTok output.
    const cost = estimateMessageCostUsd('claude-sonnet-5', { input_tokens: 1_000_000, output_tokens: 1_000_000 })
    expect(cost).toBeCloseTo(2 + 10, 6)
  })

  it('prices cache reads at 0.1x the base input rate', () => {
    const cost = estimateMessageCostUsd('claude-sonnet-5', { cache_read_input_tokens: 1_000_000 })
    expect(cost).toBeCloseTo(2 * 0.1, 6)
  })

  it('prices granular cache writes at their own TTL rate (1.25x for 5m, 2x for 1h)', () => {
    const cost = estimateMessageCostUsd('claude-sonnet-5', {
      cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 1_000_000 },
    })
    expect(cost).toBeCloseTo(2 * 1.25 + 2 * 2, 6)
  })

  it('falls back to the 5m rate for a pre-breakdown combined cache-write figure', () => {
    const cost = estimateMessageCostUsd('claude-sonnet-5', { cache_creation_input_tokens: 1_000_000 })
    expect(cost).toBeCloseTo(2 * 1.25, 6)
  })

  it('resolves a dated model snapshot id to the same rates as the bare id', () => {
    const dated = estimateMessageCostUsd('claude-haiku-4-5-20251001', { input_tokens: 1_000_000 })
    const bare = estimateMessageCostUsd('claude-haiku-4-5', { input_tokens: 1_000_000 })
    expect(dated).toBeCloseTo(bare!, 6)
  })

  it('returns null for a model outside the pricing table', () => {
    expect(estimateMessageCostUsd('some-unknown-model', { input_tokens: 100 })).toBeNull()
  })

  it('treats missing usage fields as zero rather than throwing', () => {
    expect(estimateMessageCostUsd('claude-sonnet-5', {})).toBe(0)
  })
})

describe('SpendTracker', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  function newProjectsRoot() {
    dir = mkdtempSync(join(tmpdir(), 'vide-spend-test-'))
    return dir
  }

  function writeTranscript(root: string, project: string, session: string, lines: object[]) {
    const projectDir = join(root, project)
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, `${session}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
  }

  function assistantLine(ts: string, model: string, usage: object) {
    return { type: 'assistant', timestamp: ts, message: { role: 'assistant', model, usage } }
  }

  it('returns zero spend when the projects directory does not exist', () => {
    const tracker = new SpendTracker(join(tmpdir(), 'vide-spend-does-not-exist'))
    expect(tracker.computeSpend(0, 0, Date.now())).toEqual({ sessionSpendUsd: 0, weeklySpendUsd: 0 })
  })

  it('sums message costs within each window from a transcript', () => {
    const root = newProjectsRoot()
    const now = Date.parse('2026-08-30T12:00:00Z')
    writeTranscript(root, '-Users-thomas-Documents-vIDE', 'session-a', [
      assistantLine('2026-08-30T10:00:00Z', 'claude-sonnet-5', { input_tokens: 1_000_000 }), // $2, inside both windows
      assistantLine('2026-08-25T10:00:00Z', 'claude-sonnet-5', { input_tokens: 1_000_000 }), // $2, only inside the weekly window
      assistantLine('2026-08-01T10:00:00Z', 'claude-sonnet-5', { input_tokens: 1_000_000 }), // $2, outside both windows
    ])

    const tracker = new SpendTracker(root)
    const sessionStart = Date.parse('2026-08-30T07:00:00Z') // 5h session window
    const weeklyStart = Date.parse('2026-08-23T12:00:00Z') // 7d weekly window
    const result = tracker.computeSpend(sessionStart, weeklyStart, now)
    expect(result.sessionSpendUsd).toBeCloseTo(2, 6)
    expect(result.weeklySpendUsd).toBeCloseTo(4, 6)
  })

  it('only re-reads bytes appended since the previous scan', () => {
    const root = newProjectsRoot()
    const now = Date.parse('2026-08-30T12:00:00Z')
    writeTranscript(root, 'proj', 'session-a', [assistantLine('2026-08-30T10:00:00Z', 'claude-sonnet-5', { input_tokens: 1_000_000 })])

    const tracker = new SpendTracker(root)
    const first = tracker.computeSpend(0, 0, now)
    expect(first.weeklySpendUsd).toBeCloseTo(2, 6)

    appendFileSync(
      join(root, 'proj', 'session-a.jsonl'),
      JSON.stringify(assistantLine('2026-08-30T11:00:00Z', 'claude-sonnet-5', { input_tokens: 1_000_000 })) + '\n'
    )
    const second = tracker.computeSpend(0, 0, now)
    expect(second.weeklySpendUsd).toBeCloseTo(4, 6)
  })

  it('ignores lines with no usage, an unknown model, or malformed JSON', () => {
    const root = newProjectsRoot()
    const now = Date.parse('2026-08-30T12:00:00Z')
    const projectDir = join(root, 'proj')
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(
      join(projectDir, 'session-a.jsonl'),
      [
        JSON.stringify({ type: 'user', timestamp: '2026-08-30T10:00:00Z', message: { role: 'user', content: 'hi' } }),
        JSON.stringify(assistantLine('2026-08-30T10:00:00Z', 'some-unknown-model', { input_tokens: 1_000_000 })),
        'not valid json',
        JSON.stringify(assistantLine('2026-08-30T10:00:00Z', 'claude-sonnet-5', { input_tokens: 1_000_000 })),
      ].join('\n') + '\n'
    )

    const tracker = new SpendTracker(root)
    expect(tracker.computeSpend(0, 0, now).weeklySpendUsd).toBeCloseTo(2, 6)
  })

  it('returns zero for a null window start without scanning it into the total', () => {
    const root = newProjectsRoot()
    const now = Date.parse('2026-08-30T12:00:00Z')
    writeTranscript(root, 'proj', 'session-a', [assistantLine('2026-08-30T10:00:00Z', 'claude-sonnet-5', { input_tokens: 1_000_000 })])

    const tracker = new SpendTracker(root)
    const result = tracker.computeSpend(null, null, now)
    expect(result).toEqual({ sessionSpendUsd: 0, weeklySpendUsd: 0 })
  })
})
