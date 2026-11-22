import { describe, it, expect } from 'vitest'
import { lastAssistantText, replyTextFromStopPayload } from '../claudeStop'

const assistant = (content: unknown) => JSON.stringify({ type: 'assistant', message: { role: 'assistant', content } })
const user = (content: unknown) => JSON.stringify({ type: 'user', message: { role: 'user', content } })
const text = (t: string) => ({ type: 'text', text: t })
const toolUse = { type: 'tool_use', id: 't1', name: 'Bash', input: {} }
const toolResult = { type: 'tool_result', tool_use_id: 't1', content: 'ok' }

describe('lastAssistantText', () => {
  it('returns the last assistant text of the current turn', () => {
    const lines = [user('hi'), assistant([text('first')]), assistant([text('second')])]
    expect(lastAssistantText(lines)).toBe('second')
  })

  it('skips assistant entries that only have tool_use', () => {
    const lines = [user('hi'), assistant([text('Done editing.')]), assistant([toolUse])]
    expect(lastAssistantText(lines)).toBe('Done editing.')
  })

  it('returns empty when a string user prompt follows the last assistant text', () => {
    expect(lastAssistantText([assistant([text('old')]), user('new prompt')])).toBe('')
  })

  it('returns empty when an array user prompt with a text block follows', () => {
    expect(lastAssistantText([assistant([text('old')]), user([text('new prompt')])])).toBe('')
  })

  it('does not stop at tool_result-only user entries', () => {
    const lines = [user('hi'), assistant([text('Running it.'), toolUse]), user([toolResult]), assistant([toolUse])]
    expect(lastAssistantText(lines)).toBe('Running it.')
  })

  it('ignores unparseable lines', () => {
    const lines = ['{"partial": ', assistant([text('ok')]), 'garbage']
    expect(lastAssistantText(lines)).toBe('ok')
  })

  it('joins multiple text blocks', () => {
    expect(lastAssistantText([assistant([text('one'), toolUse, text('two')])])).toBe('one\ntwo')
  })

  it('returns empty for no lines', () => {
    expect(lastAssistantText([])).toBe('')
  })
})

describe('replyTextFromStopPayload', () => {
  it('prefers last_assistant_message', async () => {
    const readLines = async () => { throw new Error('should not read') }
    const raw = JSON.stringify({ last_assistant_message: '  Hello there  ', transcript_path: '/t.jsonl' })
    expect(await replyTextFromStopPayload(raw, readLines)).toBe('Hello there')
  })

  it('falls back to the transcript', async () => {
    const paths: string[] = []
    const readLines = async (p: string) => { paths.push(p); return [user('hi'), assistant([text('from transcript')])] }
    const raw = JSON.stringify({ last_assistant_message: '   ', transcript_path: '/t.jsonl' })
    expect(await replyTextFromStopPayload(raw, readLines)).toBe('from transcript')
    expect(paths).toEqual(['/t.jsonl'])
  })

  it('returns empty for invalid JSON', async () => {
    expect(await replyTextFromStopPayload('not json', async () => [])).toBe('')
  })

  it('returns empty without a transcript_path', async () => {
    expect(await replyTextFromStopPayload('{}', async () => [assistant([text('x')])])).toBe('')
  })

  it('returns empty when the reader throws', async () => {
    const raw = JSON.stringify({ transcript_path: '/missing.jsonl' })
    expect(await replyTextFromStopPayload(raw, async () => { throw new Error('ENOENT') })).toBe('')
  })
})
