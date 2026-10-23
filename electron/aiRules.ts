import { ipcMain } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { BROWSER_MCP_SERVER_NAME, MCP_SERVER_NAME, NOTES_MCP_SERVER_NAME, SCRIPTS_MCP_SERVER_NAME } from './mcp/mcpRegistration'
import {
  AI_TOOL_IDS, DEFAULT_AI_PRESET_VALUES, boardRules, presetRules,
  type AiBoardRule, type AiPresetValues, type AiRulesListId, type AiRulesToolId,
} from './aiRulesPresets'

// AI rules: the user's own standing instructions, appended to the system
// prompt of every Claude session vIDE launches (plain and Rocky), so they
// apply in every project without touching the repo's or ~/.claude's files.
// One general list (Settings > Claude) plus, per vIDE tool, preset controls
// and an extra-rules list on that tool's settings page; To Do also has a
// board table. Read fresh on each spawn, so edits apply to the next session.

export interface AiRules {
  enabled: boolean
  presets: AiPresetValues
  boards: AiBoardRule[]
  lists: Record<AiRulesListId, string[]>
}

export const DEFAULT_AI_RULES_LISTS: Record<AiRulesListId, string[]> = {
  general: [
    'Keep token usage low: targeted reads (line ranges, outlines) over whole files, do not re-read what is already in context, keep replies short.',
  ],
  todos: [], scripts: [], notes: [], browser: [], graphify: [],
}

const SECTION_TITLES: Record<AiRulesListId, string> = {
  general: 'USER RULES (from vIDE Settings; follow these in every project)',
  todos: 'VIDE TODOS RULES',
  scripts: 'VIDE SCRIPTS RULES',
  notes: 'VIDE NOTES RULES',
  browser: 'VIDE BROWSER RULES',
  graphify: 'GRAPHIFY RULES',
}

// A tool section only applies while that tool's MCP server is registered
// with Claude Code (its "Claude Code" switch). Graphify has no MCP server.
const TOOL_MCP_SERVER: Partial<Record<AiRulesToolId, string>> = {
  todos: MCP_SERVER_NAME,
  scripts: SCRIPTS_MCP_SERVER_NAME,
  notes: NOTES_MCP_SERVER_NAME,
  browser: BROWSER_MCP_SERVER_NAME,
}

const BOARD_FIELDS: (keyof AiBoardRule)[] = ['board', 'boardName', 'useFor', 'notFor', 'tags', 'folders']

let rulesFile: string | undefined

export function initAiRules(file: string): void {
  rulesFile = file
}

export function getAiRules(): AiRules {
  let saved: Partial<AiRules> = {}
  try {
    saved = JSON.parse(readFileSync(rulesFile!, 'utf-8'))
  } catch {
    // missing or unreadable, use defaults
  }
  const lists = { ...DEFAULT_AI_RULES_LISTS }
  for (const id of Object.keys(lists) as AiRulesListId[]) {
    const list = saved.lists?.[id]
    if (Array.isArray(list)) lists[id] = list.filter((r): r is string => typeof r === 'string')
  }
  const presets = Object.fromEntries(
    AI_TOOL_IDS.map((tool) => [tool, { ...DEFAULT_AI_PRESET_VALUES[tool], ...saved.presets?.[tool] }])
  ) as AiPresetValues
  const boards = Array.isArray(saved.boards)
    ? saved.boards.map((b) => Object.fromEntries(BOARD_FIELDS.map((f) => [f, typeof b?.[f] === 'string' ? b[f] : ''])) as unknown as AiBoardRule)
    : []
  return { enabled: saved.enabled !== false, presets, boards, lists }
}

export function setAiRules(rules: AiRules): void {
  if (!rulesFile) return
  try {
    writeFileSync(rulesFile, JSON.stringify(rules))
  } catch (e) {
    console.error('AI rules write failed:', e)
  }
}

// MCP servers registered at user scope in ~/.claude.json.
export function registeredMcpServers(configFile = join(homedir(), '.claude.json')): Set<string> {
  try {
    return new Set(Object.keys(JSON.parse(readFileSync(configFile, 'utf-8')).mcpServers ?? {}))
  } catch {
    return new Set()
  }
}

function section(id: AiRulesListId, lines: string[]): string[] {
  const rules = lines.map((r) => r.trim()).filter(Boolean)
  return rules.length ? [`${SECTION_TITLES[id]}:\n${rules.map((r) => `- ${r}`).join('\n')}`] : []
}

// The text appended to the system prompt, or '' when off or empty.
export function aiRulesPrompt(rules: AiRules = getAiRules(), mcpServers: Set<string> = registeredMcpServers()): string {
  if (!rules.enabled) return ''
  const tools = AI_TOOL_IDS.flatMap((tool) => {
    const server = TOOL_MCP_SERVER[tool]
    if (server && !mcpServers.has(server)) return []
    return section(tool, [
      ...presetRules(tool, rules.presets[tool]),
      ...(tool === 'todos' ? boardRules(rules.boards) : []),
      ...rules.lists[tool],
    ])
  })
  return [...section('general', rules.lists.general), ...tools].join('\n\n')
}

export function registerAiRulesHandlers(): void {
  ipcMain.handle('aiRules:get', () => getAiRules())
  ipcMain.handle('aiRules:set', (_evt, rules: AiRules) => setAiRules(rules))
  ipcMain.handle('aiRules:getDefaults', () => DEFAULT_AI_RULES_LISTS)
}
