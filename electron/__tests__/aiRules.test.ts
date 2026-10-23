import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ app: { getPath: vi.fn() }, ipcMain: { handle: vi.fn() } }))

import { DEFAULT_AI_RULES_LISTS, aiRulesPrompt, getAiRules, initAiRules, registeredMcpServers, type AiRules } from '../aiRules'
import { AI_PRESETS, DEFAULT_AI_PRESET_VALUES, boardRules, presetRules } from '../aiRulesPresets'

const EMPTY_LISTS = { general: [], todos: [], scripts: [], notes: [], browser: [], graphify: [] }
const ALL_OFF = Object.fromEntries(
  Object.entries(AI_PRESETS).map(([tool, presets]) => [tool, Object.fromEntries(presets.map((p) => [p.id, p.kind === 'toggle' ? false : 'off']))])
) as AiRules['presets']

function rules(patch: Partial<AiRules>): AiRules {
  return { enabled: true, presets: ALL_OFF, boards: [], lists: EMPTY_LISTS, ...patch }
}

describe('AI rules', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vide-ai-rules-'))
    initAiRules(join(dir, 'ai-rules.json'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('defaults to on, with default presets and lists', () => {
    expect(getAiRules()).toEqual({ enabled: true, presets: DEFAULT_AI_PRESET_VALUES, boards: [], lists: DEFAULT_AI_RULES_LISTS })
  })

  it('fills in anything a saved file is missing', () => {
    writeFileSync(join(dir, 'ai-rules.json'), JSON.stringify({ enabled: false, presets: { todos: { close: 'ask' } }, boards: [{ board: 'VIDE' }], lists: { general: ['a'] } }))
    const saved = getAiRules()
    expect(saved.enabled).toBe(false)
    expect(saved.presets.todos).toEqual({ ...DEFAULT_AI_PRESET_VALUES.todos, close: 'ask' })
    expect(saved.boards).toEqual([{ board: 'VIDE', boardName: '', useFor: '', notFor: '', tags: '', folders: '' }])
    expect(saved.lists.general).toEqual(['a'])
    expect(saved.lists.todos).toEqual([])
  })

  it('turns preset choices into rule lines', () => {
    expect(presetRules('graphify', { queryFirst: true, updateAfter: false })).toEqual(['When the project has graphify-out/graph.json, run graphify query "<question>" before grepping or reading files broadly.'])
    expect(presetRules('todos', { autoTrack: false, progress: 'off', close: 'ask', unrelated: 'mention' })).toEqual([
      'Ask before marking a ticket done.',
      'Mention unrelated discoveries in the reply instead of filing tickets.',
    ])
  })

  it('turns board rows into one line each, skipping rows with no board', () => {
    expect(boardRules([
      { board: 'TEAMREQ', boardName: 'Team Requests', useFor: 'work other teams ask for', notFor: 'core infra', tags: 'new, support', folders: '' },
      { board: '', boardName: '', useFor: 'ignored', notFor: '', tags: '', folders: '' },
    ])).toEqual([
      'Pick the board for each ticket by these board rules; when work fits none, ask which board to use.',
      'Board TEAMREQ (Team Requests): use for work other teams ask for. Not for core infra. Tag every ticket with one of: new, support.',
    ])
    expect(boardRules([])).toEqual([])
  })

  it('writes the general section, then each tool section with presets, boards and extras', () => {
    const prompt = aiRulesPrompt(rules({
      lists: { ...EMPTY_LISTS, general: [' No em dashes ', ''], todos: ['Extra todo rule'] },
      presets: { ...ALL_OFF, todos: { ...ALL_OFF.todos, close: 'verified' } },
      boards: [{ board: 'VIDE', boardName: 'vIDE', useFor: 'the vIDE app', notFor: '', tags: '', folders: '' }],
    }), new Set(['vide-todos']))
    expect(prompt).toBe([
      'USER RULES (from vIDE Settings; follow these in every project):\n- No em dashes',
      'VIDE TODOS RULES:\n- Mark the ticket done once the work is verified.\n' +
        '- Pick the board for each ticket by these board rules; when work fits none, ask which board to use.\n' +
        '- Board VIDE (vIDE): use for the vIDE app.\n- Extra todo rule',
    ].join('\n\n'))
  })

  it('only includes a tool section while its MCP server is registered; graphify always', () => {
    const r = rules({ lists: { ...EMPTY_LISTS, todos: ['Track work'], graphify: ['Query first'] } })
    expect(aiRulesPrompt(r, new Set())).toBe('GRAPHIFY RULES:\n- Query first')
    expect(aiRulesPrompt(r, new Set(['vide-todos']))).toBe('VIDE TODOS RULES:\n- Track work\n\nGRAPHIFY RULES:\n- Query first')
  })

  it('returns nothing when turned off', () => {
    expect(aiRulesPrompt(rules({ enabled: false, presets: DEFAULT_AI_PRESET_VALUES }), new Set(['vide-todos']))).toBe('')
  })

  it('reads registered MCP servers from the Claude config', () => {
    const config = join(dir, 'claude.json')
    writeFileSync(config, JSON.stringify({ mcpServers: { 'vide-todos': {}, other: {} } }))
    expect([...registeredMcpServers(config)]).toEqual(['vide-todos', 'other'])
    expect(registeredMcpServers(join(dir, 'missing.json')).size).toBe(0)
  })

  it('keeps apostrophes out of the default rule text', () => {
    expect(JSON.stringify([AI_PRESETS, DEFAULT_AI_RULES_LISTS])).not.toContain("'")
  })
})
