import { describe, it, expect } from 'vitest'
import { trimToolPayloads, TRIM_MARKER } from '../bridgeTrim'
import type { BridgeMessage } from '../bridge'

const BIG = 'x'.repeat(5000)
const OPTS = { keepRecentRounds: 2, minPayloadChars: 100, minSavingsChars: 1000 }

function round(id: string, name: string, args: Record<string, unknown>, result: string): BridgeMessage[] {
  return [
    { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] },
    { role: 'tool', tool_call_id: id, content: result },
  ]
}

function transcript(): BridgeMessage[] {
  return [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'build it' },
    ...round('a', 'read_file', { path: '/p/spec.md', startLine: 10, endLine: 400 }, BIG),
    ...round('b', 'create_file', { path: '/p/app.ts', content: BIG }, 'Created /p/app.ts'),
    ...round('c', 'read_file', { path: '/p/recent.ts' }, BIG),
    ...round('d', 'edit_file', { path: '/p/app.ts', old_string: BIG, new_string: BIG }, 'Edited /p/app.ts'),
  ]
}

describe('trimToolPayloads', () => {
  it('stubs old tool results and file bodies but leaves the recent rounds intact', () => {
    const out = trimToolPayloads(transcript(), OPTS)!
    expect(out).not.toBeNull()

    const oldRead = out[3].content!
    expect(oldRead.startsWith(TRIM_MARKER)).toBe(true)
    expect(oldRead).toContain('read_file result of /p/spec.md (lines 10-400)')

    const createArgs = JSON.parse(out[4].tool_calls![0].function.arguments)
    expect(createArgs.path).toBe('/p/app.ts')
    expect(createArgs.content.startsWith(TRIM_MARKER)).toBe(true)

    // Rounds c and d are the 2 protected rounds.
    expect(out[7].content).toBe(BIG)
    expect(JSON.parse(out[8].tool_calls![0].function.arguments).new_string).toBe(BIG)
  })

  it('keeps system and user messages untouched', () => {
    const out = trimToolPayloads(transcript(), OPTS)!
    expect(out.slice(0, 2)).toEqual(transcript().slice(0, 2))
  })

  it('does nothing until enough is freeable, so the prompt cache is not invalidated every round', () => {
    expect(trimToolPayloads(transcript(), { ...OPTS, minSavingsChars: 1_000_000 })).toBeNull()
  })

  it('does nothing when there are fewer rounds than the protected tail', () => {
    expect(trimToolPayloads(transcript().slice(0, 6), { ...OPTS, keepRecentRounds: 4 })).toBeNull()
  })

  it('never re-trims a stub, so a second pass frees nothing', () => {
    const once = trimToolPayloads(transcript(), OPTS)!
    expect(trimToolPayloads(once, OPTS)).toBeNull()
  })

  it('does not mutate the input', () => {
    const input = transcript()
    trimToolPayloads(input, OPTS)
    expect(input).toEqual(transcript())
  })
})
