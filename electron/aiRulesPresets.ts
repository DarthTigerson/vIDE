// AI rules presets: the controlled options each vIDE tool offers on its
// settings page, and the prompt line each choice turns into. Pure data, so
// the renderer (controls) and main process (prompt) share one definition.
// No apostrophes in any rule text: the prompt travels through the shell env.

export type AiRulesToolId = 'todos' | 'scripts' | 'notes' | 'browser' | 'graphify'
export type AiRulesListId = 'general' | AiRulesToolId

export type AiPreset =
  | { kind: 'toggle'; id: string; label: string; default: boolean; rule: string }
  | { kind: 'select'; id: string; label: string; default: string; choices: { value: string; label: string; rule: string }[] }

export type AiPresetValues = Record<AiRulesToolId, Record<string, boolean | string>>

// One row of the To Do board table.
export interface AiBoardRule {
  board: string
  boardName: string
  useFor: string
  notFor: string
  tags: string
  folders: string
}

const SAVE_CHOICES = (what: string, tool: string) => [
  { value: 'always', label: 'Without asking', rule: `Save ${what} with ${tool} without being asked.` },
  { value: 'ask', label: 'Ask first', rule: `Ask before saving ${what} with ${tool}.` },
  { value: 'never', label: 'Only when asked', rule: `Only use ${tool} when the user asks.` },
]

export const AI_PRESETS: Record<AiRulesToolId, AiPreset[]> = {
  todos: [
    {
      kind: 'toggle', id: 'autoTrack', label: 'Track work automatically', default: true,
      rule: 'For any task bigger than a quick answer, track it on a todo board without being asked: create or reuse a ticket and call start_todo before working.',
    },
    {
      kind: 'select', id: 'progress', label: 'Progress comments', default: 'eachChange',
      choices: [
        { value: 'eachChange', label: 'After each change', rule: 'Add a one-line add_todo_comment (what changed, which files) after each meaningful change.' },
        { value: 'endOfTask', label: 'At the end', rule: 'Add one add_todo_comment summarising the work when the task is finished.' },
        { value: 'off', label: 'Off', rule: '' },
      ],
    },
    {
      kind: 'select', id: 'close', label: 'Close tickets', default: 'verified',
      choices: [
        { value: 'verified', label: 'When verified', rule: 'Mark the ticket done once the work is verified.' },
        { value: 'ask', label: 'Ask first', rule: 'Ask before marking a ticket done.' },
        { value: 'never', label: 'Never', rule: 'Never mark tickets done; leave that to the user.' },
      ],
    },
    {
      kind: 'select', id: 'unrelated', label: 'Unrelated findings', default: 'ticket',
      choices: [
        { value: 'ticket', label: 'New ticket', rule: 'File unrelated discoveries as their own ticket instead of expanding scope.' },
        { value: 'mention', label: 'Mention only', rule: 'Mention unrelated discoveries in the reply instead of filing tickets.' },
      ],
    },
  ],
  scripts: [
    {
      kind: 'toggle', id: 'reuseFirst', label: 'Reuse before creating', default: true,
      rule: 'Before writing a shell routine, check list_scripts and reuse or update a matching script.',
    },
    { kind: 'select', id: 'save', label: 'Save reusable routines', default: 'always', choices: SAVE_CHOICES('routines likely to be run again', 'create_script') },
    {
      kind: 'select', id: 'titleStyle', label: 'Title style', default: 'verbSentence',
      choices: [
        { value: 'verbSentence', label: 'Restart Traefik on cluster', rule: 'Script titles are short, verb-first, sentence case, e.g. "Restart Traefik on cluster".' },
        { value: 'titleCase', label: 'Restart Traefik On Cluster', rule: 'Script titles are short, verb-first, Title Case, e.g. "Restart Traefik On Cluster".' },
        { value: 'kebab', label: 'restart-traefik-cluster', rule: 'Script titles are short, verb-first, kebab-case, e.g. "restart-traefik-cluster".' },
      ],
    },
    {
      kind: 'toggle', id: 'describe', label: 'Describe when to use', default: true,
      rule: 'Script descriptions say when to use the script and what it needs.',
    },
  ],
  notes: [
    { kind: 'select', id: 'save', label: 'Save findings', default: 'always', choices: SAVE_CHOICES('durable findings (root causes, gotchas, decisions)', 'write_note') },
    {
      kind: 'toggle', id: 'searchFirst', label: 'Search notes first', default: true,
      rule: 'Search notes before investigating something that may have been solved before.',
    },
  ],
  browser: [
    {
      kind: 'toggle', id: 'preferVide', label: 'Prefer vIDE browser', default: true,
      rule: 'Use the vIDE browser tools for web pages instead of asking to install a browser extension.',
    },
  ],
  graphify: [
    {
      kind: 'toggle', id: 'queryFirst', label: 'Query before searching', default: true,
      rule: 'When the project has graphify-out/graph.json, run graphify query "<question>" before grepping or reading files broadly.',
    },
    {
      kind: 'toggle', id: 'updateAfter', label: 'Update after changes', default: true,
      rule: 'Run graphify update . after changing code.',
    },
  ],
}

export const AI_TOOL_IDS = Object.keys(AI_PRESETS) as AiRulesToolId[]

export const DEFAULT_AI_PRESET_VALUES = Object.fromEntries(
  AI_TOOL_IDS.map((tool) => [tool, Object.fromEntries(AI_PRESETS[tool].map((p) => [p.id, p.default]))])
) as AiPresetValues

// Prompt lines for one tool's preset choices.
export function presetRules(tool: AiRulesToolId, values: Record<string, boolean | string>): string[] {
  return AI_PRESETS[tool].flatMap((p) => {
    const value = values[p.id] ?? p.default
    if (p.kind === 'toggle') return value === true ? [p.rule] : []
    const rule = p.choices.find((c) => c.value === value)?.rule ?? ''
    return rule ? [rule] : []
  })
}

// Prompt lines for the To Do board table; rows without a board are skipped.
export function boardRules(boards: AiBoardRule[]): string[] {
  const rows = boards.filter((b) => b.board.trim())
  if (!rows.length) return []
  return [
    'Pick the board for each ticket by these board rules; when work fits none, ask which board to use.',
    ...rows.map((b) => {
      const name = b.boardName.trim() ? ` (${b.boardName.trim()})` : ''
      return [
        `Board ${b.board.trim()}${name}:`,
        b.useFor.trim() && `use for ${b.useFor.trim()}.`,
        b.notFor.trim() && `Not for ${b.notFor.trim()}.`,
        b.tags.trim() && `Tag every ticket with one of: ${b.tags.trim()}.`,
        b.folders.trim() && `Linked folders: ${b.folders.trim()}.`,
      ].filter(Boolean).join(' ')
    }),
  ]
}
