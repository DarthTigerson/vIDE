import { app, BrowserWindow, ipcMain } from 'electron'
import { isMultiRepoProject, MULTI_REPO_PATHS_PROMPT } from './multiRepoPaths'
import { ROCKY_VOICE } from './rocky'
import { readFile, writeFile, unlink, rename, access } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join, relative } from 'path'
import { listAllFiles, searchText, buildTree } from './fsOps'
import { ALL_VIDE_TOOL_GROUPS, ALWAYS_ON_VIDE_TOOL_GROUPS, buildVideTools, toOpenAiTool, toolResultText, type BridgeAgentKind, type VideToolContext, type VideToolGroup, type VideToolSet } from './bridgeVideTools'
import { decideStopAction } from './mcp/todoEnforcerHook'
import { trimToolPayloads } from './bridgeTrim'
import { ThinkTagSplitter } from './bridgeReasoning'
import { AUTO_COMPACT_RATIO, compactMessages, fetchContextWindow, isContextOverflow, summarize, wrapSummary } from './bridgeCompact'
import { minimatch } from 'minimatch'

const execFileAsync = promisify(execFile)

export type BridgeRole = 'system' | 'user' | 'assistant' | 'tool'

export interface BridgeToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface BridgeMessage {
  role: BridgeRole
  content: string | null
  tool_calls?: BridgeToolCall[]
  tool_call_id?: string
}

export interface BridgeSettings {
  endpoint: string
  apiKey: string
  modelId: string
  sessionId?: string
  // Max tool-call rounds per turn; 0 or missing = unlimited
  toolCallLimit?: number
  // vIDE tool groups to expose, mirroring the per-feature MCP toggles that
  // gate the same tools for Claude; missing = all. Search and docs are always on.
  videTools?: VideToolGroup[]
  // Which agent this is (todo authorship); missing = 'bridge'.
  agentKind?: BridgeAgentKind
  // Compact once the prompt reaches this many tokens, even when 80% of the
  // context window is further off. Set for llama models whose context
  // llama.cpp sizes itself (Auto-optimize), which can be 200k+ tokens.
  compactAtTokens?: number
  // Per-request reasoning_effort (llama.cpp; 'none' turns thinking off).
  // Missing = the server's own default. Can change mid-run: see setReasoningEffort.
  reasoningEffort?: ReasoningEffort
  // Started from the "+" menu's Rocky tab: the system prompt ends with
  // Rocky's voice rules.
  rocky?: boolean
}

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh'

// Tokens at which a turn compacts: 80% of the window, or a fixed cap if lower.
// null = neither is known, so never.
export function compactThreshold(contextWindow: number | null, cap?: number): number | null {
  const byWindow = contextWindow ? contextWindow * AUTO_COMPACT_RATIO : null
  if (cap && cap > 0) return byWindow === null ? cap : Math.min(byWindow, cap)
  return byWindow
}

export interface BridgeSendPayload {
  cwd: string
  messages: BridgeMessage[]
  agentMode: boolean
  settings: BridgeSettings
  // The renderer's agent-session id. Omitted = '' (one default conversation
  // per window) — what the pre-multi-session callers and tests send.
  sessionId?: string
}

export interface BridgeCompactPayload {
  messages: BridgeMessage[]
  settings: BridgeSettings
  // Optional "focus on…" instruction for the summary.
  focus?: string
}

export interface BridgeStoredSettings {
  endpoint: string
  apiKey: string
  modelId: string
}

function bridgeSettingsPath(): string {
  return join(app.getPath('userData'), 'bridge-settings.json')
}

// Disk-backed settings, shared by the desktop ipcMain handlers (registered in
// electron/main.ts's registerBridgeSettingsHandlers()) and the mobile relay
// (bridgeChannels.ts) — both read/write the same bridge-settings.json under
// userData, so pairing a phone doesn't require re-entering Bridge's endpoint/
// API key/model separately from the desktop app.
export async function getBridgeSettings(): Promise<BridgeStoredSettings | null> {
  try {
    const data = await readFile(bridgeSettingsPath(), 'utf-8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

export async function setBridgeSettings(settings: BridgeStoredSettings): Promise<void> {
  try {
    await writeFile(bridgeSettingsPath(), JSON.stringify(settings), 'utf-8')
  } catch {}
}

export type BridgeEvent =
  | { type: 'text-delta'; delta: string }
  // The model's reasoning, shown in the chat but never sent back to it.
  | { type: 'reasoning-delta'; delta: string }
  | { type: 'content-replace'; content: string }
  | { type: 'tool-call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'need-approval'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool-result'; id: string; result: string; isError: boolean }
  | { type: 'new-turn' }
  | { type: 'done' }
  | { type: 'error'; message: string }
  // vIDE Compacting: a summary is being written / replaced the transcript.
  | { type: 'compacting' }
  // `content` is the summary as the user message the transcript now starts with.
  | { type: 'compacted'; summary: string; content: string }
  // Tokens the last request used, and the context window when known.
  // tokensPerSecond: generation speed of that request, when it can be told.
  | { type: 'usage'; usedTokens: number; contextWindow: number | null; tokensPerSecond?: number }

export type BridgeSessionEvent = BridgeEvent & { sessionId?: string }

// One in-flight conversation per (window, agent session) — several Bridge /
// llama sessions in the same window stream concurrently.
function convKey(winId: number, sessionId: string | undefined): string {
  return `${winId}:${sessionId ?? ''}`
}

interface StreamChunkDelta {
  content?: string
  // llama.cpp / DeepSeek name it reasoning_content; vLLM and OpenRouter use reasoning.
  reasoning_content?: string
  reasoning?: string
  tool_calls?: Array<{
    index: number
    id?: string
    function?: { name?: string; arguments?: string }
  }>
}

interface StreamChunk {
  // OpenAI sends the usage chunk with an empty choices array; be lenient.
  choices?: Array<{ delta: StreamChunkDelta; finish_reason: string | null }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  // llama.cpp's own measurement, on the last chunk.
  timings?: { predicted_per_second?: number }
}

interface StreamResult {
  content: string
  toolCalls: PendingToolCall[]
  // prompt + completion tokens of this request, when the server reports usage.
  usedTokens?: number
  tokensPerSecond?: number
}

function parseSSEChunk(raw: string): StreamChunk | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('data:')) return null
  const payload = trimmed.slice('data:'.length).trim()
  if (payload === '[DONE]') return null
  try {
    return JSON.parse(payload) as StreamChunk
  } catch {
    return null
  }
}

export const BRIDGE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file at an absolute path. Optionally pass startLine/endLine (1-indexed, inclusive) to read only part of a large file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          startLine: { type: 'number' },
          endLine: { type: 'number' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file at an absolute path, creating or overwriting it.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace an exact, unique occurrence of old_string with new_string in the file at path. Prefer this over write_file for any change to an existing file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string' },
          new_string: { type: 'string' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_file',
      description: "Create a new file at an absolute path with the given content. Fails if the file already exists — use edit_file or write_file for existing files.",
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List the entries (files and directories) of a directory at an absolute path.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep_search',
      description: 'Search for a text query across all files under an absolute root path.',
      parameters: {
        type: 'object',
        properties: {
          root: { type: 'string' },
          query: { type: 'string' },
          caseSensitive: { type: 'boolean' },
        },
        required: ['root', 'query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob_search',
      description: 'Find files whose path matches a glob pattern (e.g. "**/*.ts") under an absolute root path.',
      parameters: {
        type: 'object',
        properties: { pattern: { type: 'string' }, root: { type: 'string' } },
        required: ['pattern', 'root'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command in the project directory and capture its output.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete the file at an absolute path.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_file',
      description: 'Rename or move a file from one absolute path to another.',
      parameters: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' } },
        required: ['from', 'to'],
      },
    },
  },
] as const

// Fallback: some models emit tool calls as plain text JSON rather than via the
// OpenAI tool_calls streaming field. This extracts them and strips them from
// the displayed content so they don't show as raw JSON to the user.
// Regex that matches the opening of a potential tool-call JSON object,
// with optional whitespace after the brace (models vary: `{"name"` vs `{ "name"`).
const TEXT_TOOL_START_RE = /\{\s*"name"\s*:/g

function extractTextToolCalls(content: string): { toolCalls: PendingToolCall[]; cleanedContent: string } {
  const found: Array<{ start: number; end: number; parsed: Record<string, unknown> }> = []

  TEXT_TOOL_START_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TEXT_TOOL_START_RE.exec(content)) !== null) {
    const start = match.index
    // Walk forward counting braces to find the matching closing brace
    let depth = 0, end = -1
    for (let j = start; j < content.length; j++) {
      if (content[j] === '{') depth++
      else if (content[j] === '}') { depth--; if (depth === 0) { end = j + 1; break } }
    }
    if (end === -1) continue
    try {
      const parsed = JSON.parse(content.slice(start, end)) as Record<string, unknown>
      if (typeof parsed.name === 'string' && (parsed.arguments || parsed.args)) {
        found.push({ start, end, parsed })
        TEXT_TOOL_START_RE.lastIndex = end
      }
    } catch {}
  }

  if (found.length === 0) return { toolCalls: [], cleanedContent: content }

  const toolCalls: PendingToolCall[] = found.map((f) => ({
    id: `text-${Math.random().toString(36).slice(2, 9)}`,
    name: f.parsed.name as string,
    args: (f.parsed.arguments ?? f.parsed.args ?? {}) as Record<string, unknown>,
  }))

  // Strip tool call JSON blocks (reverse order to keep indices valid)
  let cleaned = content
  for (const f of [...found].reverse()) {
    cleaned = cleaned.slice(0, f.start) + cleaned.slice(f.end)
  }

  return { toolCalls, cleanedContent: cleaned.trim() }
}

// Whole-file read_file results stop here; ranged reads aren't capped.
const READ_FILE_LINE_CAP = 500

const FILE_TOOL_GUIDANCE =
  'When modifying an existing file, prefer edit_file over write_file. Full-file rewrites waste tokens, fail on large files, and risk changing untouched code. ' +
  'Use this priority order: (1) edit_file for any change to an existing file, (2) write_file only for complete rewrites explicitly requested by the user, ' +
  "(3) create_file only for files that don't exist yet."

export async function buildSystemPrompt(cwd: string, videInstructions: string[] = [], rocky = false): Promise<string> {
  const multiRepo = await isMultiRepoProject(cwd)
  let branch = ''
  let lastCommit = ''
  try {
    const branchResult = await execFileAsync('git', ['branch', '--show-current'], { cwd, timeout: 5000 })
    branch = branchResult.stdout.trim()
    // No relative date ("5 minutes ago"): it would change the prompt's first
    // lines over time and force llama.cpp to re-read the whole conversation.
    const logResult = await execFileAsync('git', ['log', '-1', '--pretty=format:%h %s'], { cwd, timeout: 5000 })
    lastCommit = logResult.stdout.trim()
  } catch {}

  return `You are Bridge, an AI coding assistant running inside a local IDE. You have DIRECT access to the user's machine through function/tool calls.

Project directory: ${cwd}${branch ? `\nCurrent branch: ${branch}` : ''}${lastCommit ? `\nLast commit: ${lastCommit}` : ''}${multiRepo ? `\n\n${MULTI_REPO_PATHS_PROMPT}` : ''}

== TOOLS ==
You have the following tools. Use them — do not explain how the user could run commands themselves.

- read_file(path, startLine?, endLine?) — read a file. path must be the FULL absolute path returned by a previous search. For files under ~400 lines, read the whole file first (no startLine/endLine) to understand the full structure before editing. Whole-file reads stop after 500 lines and tell you the total; read further with startLine/endLine, always taking at least 80 lines of context — narrow ranges miss the surrounding structure needed for correct edits. For large Markdown docs (specs, design docs), use doc_outline and read_doc_section instead of reading the whole file.
- write_file(path, content) — overwrite a file
- edit_file(path, old_string, new_string) — patch a file. path must be the FULL absolute path.
- create_file(path, content) — create a new file
- delete_file(path) — delete a file
- move_file(from, to) — rename/move a file
- list_dir(path) — list directory contents
- grep_search(root, query, caseSensitive?) — search for text in files. caseSensitive defaults to false.
- glob_search(pattern, root) — find files by glob pattern (e.g. "**/*.tsx", "**/*Git*")
- run_command(command) — execute any shell command in the project directory

You also have vIDE's own tools (todos, notes, scripts, browser, web search — whichever are listed in your tool definitions). Their usage notes:
${videInstructions.map((i) => `- ${i}`).join('\n')}

== FINDING FILES ==
Before editing or reading any file, you MUST know its full absolute path. Follow this workflow:
1. If the user names a file explicitly (e.g. "GitPanel.tsx"), glob_search for it: glob_search("**/*GitPanel*", "${cwd}")
2. If the user describes a UI element by what it shows (e.g. "the Agent Mode toggle", "the usage section"), skip glob and go straight to grep_search for that exact text:
   - grep_search("Agent Mode", "${cwd}/src") — finds which file renders that text
   - grep_search("usage", "${cwd}/src") — finds the usage toggle
   - Use a SHORT single keyword, lowercase — grep is case-insensitive by default
3. If glob returns zero matches, immediately fall back to grep_search for the text the user described — never give up after a failed glob.
4. Read the file at the EXACT full path returned by the search before editing it.
5. Use edit_file with that EXACT full path — never guess paths.

Key rule: when a user describes a UI element by what it displays, grep for that text first — the filename is unknown until the search tells you.

== HOW TO APPROACH CODING TASKS ==
Follow this chain every time — do not skip steps:

1. FIND the file: glob_search by filename pattern (e.g. "**/*Sidebar*", "**/*Chat*")
2. LOCATE the code: grep_search for the specific symbol, component name, or text you need
3. READ before touching: read_file the full file (no startLine/endLine for files under ~400 lines) to understand context, component structure, and where things live
4. PLAN the edit mentally: identify exactly what to remove, what to add, and where — before calling any edit tool
5. EDIT minimally: use edit_file with the smallest old_string/new_string that uniquely identifies the change — never rewrite whole files or large blocks

If you don't understand the full structure after one read, read adjacent files (e.g. the sidebar component, the parent layout) before editing.
Never guess a file path — always get it from a search result first.
Never make an edit you haven't read the surrounding code for.

== GIT ==
You have full git access via run_command. When the user asks about git, ALWAYS call run_command with the appropriate git command. Examples:
- "show last commit" → run_command("git log -1")
- "show commit history" → run_command("git log --oneline -20")
- "what changed" → run_command("git diff HEAD")
- "show a commit" → run_command("git show <hash>")
- "what branch" → run_command("git branch --show-current")
- "git status" → run_command("git status")
NEVER say you cannot access git or version control. Always use run_command.

== FILE EDITING ==
${FILE_TOOL_GUIDANCE}${rocky ? `\n\n== ROCKY MODE ==\nYou speak like Rocky, the Eridian engineer from Project Hail Mary.\n\n${ROCKY_VOICE}` : ''}`
}

interface PendingToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

interface ToolExecutionResult {
  result: string
  isError: boolean
}

export class BridgeManager {
  private controllerByConv = new Map<string, AbortController>()
  private pendingApprovalsByConv = new Map<string, Map<string, (approved: boolean) => void>>()
  // The live run per conversation key. A run is live only while its token is
  // the one stored here; cancelConv deletes it and a new send replaces it, so a
  // stale run suspended at an await (slow tool, fetch, approval) can't resurrect
  // into the next run's transcript just because the key was reused.
  private runByConv = new Map<string, symbol>()
  // Current reasoning effort per conversation, read at the start of every
  // round so a change made mid-turn applies from the next request.
  private effortByConv = new Map<string, ReasoningEffort>()
  // System prompt per conversation, reused for every message of the same
  // transcript (historyId) so the prompt's start never changes and the
  // server's prompt cache stays valid across turns.
  private systemPromptByConv = new Map<string, { historyId: string; prompt: string }>()

  // Without a context (tests, or before main.ts wires one in) only the
  // self-contained groups (search, docs) are available.
  constructor(private videCtx?: VideToolContext) {}

  private videToolsFor(settings: BridgeSettings, windowId: number): VideToolSet {
    const requested = settings.videTools ?? ALL_VIDE_TOOL_GROUPS
    const groups = [...new Set<VideToolGroup>([...requested, ...ALWAYS_ON_VIDE_TOOL_GROUPS])]
    if (!this.videCtx) return buildVideTools(ALWAYS_ON_VIDE_TOOL_GROUPS, { dataDir: '' }, windowId)
    return buildVideTools(groups, this.videCtx, windowId, settings.agentKind)
  }

  registerHandlers(): void {
    ipcMain.on('bridge:send', (event, payload: BridgeSendPayload) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      // Returning the promise (instead of `void`-discarding it) is what lets
      // tests capture and await it via the mocked ipcMain.on handler map —
      // Electron itself ignores the return value either way.
      return this.send(win, payload)
    })

    ipcMain.on('bridge:cancel', (event, sessionId?: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      this.cancel(win, sessionId)
    })

    ipcMain.on('bridge:setReasoningEffort', (event, effort: ReasoningEffort, sessionId?: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      this.setReasoningEffort(win, effort, sessionId)
    })

    ipcMain.on('bridge:approve', (event, toolCallId: string, sessionId?: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      this.approve(win, toolCallId, sessionId)
    })

    ipcMain.on('bridge:reject', (event, toolCallId: string, sessionId?: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      this.reject(win, toolCallId, sessionId)
    })

    ipcMain.handle('bridge:testConnection', (_event, settings: BridgeSettings) => this.testConnection(settings))
    ipcMain.handle('bridge:compact', (_event, payload: BridgeCompactPayload) => this.compact(payload))
  }

  // The following are the same bodies that used to live directly inside the
  // ipcMain closures above, extracted so the mobile relay (bridgeChannels.ts)
  // can call the exact same logic for a mobile-originated conversation,
  // keyed off the same sentinel window the relay uses for term/claude
  // sessions (MOBILE_RELAY_WINDOW_ID) rather than a real event.sender.

  send(win: BrowserWindow, payload: BridgeSendPayload): Promise<void> {
    return this.runConversation(win, payload)
  }

  cancel(win: BrowserWindow, sessionId?: string): void {
    this.cancelConv(convKey(win.id, sessionId))
  }

  private async systemPromptFor(key: string, historyId: string | undefined, cwd: string, videInstructions: string[], rocky = false): Promise<string> {
    const cached = this.systemPromptByConv.get(key)
    if (historyId && cached?.historyId === historyId) return cached.prompt
    const prompt = await buildSystemPrompt(cwd, videInstructions, rocky)
    if (historyId) this.systemPromptByConv.set(key, { historyId, prompt })
    return prompt
  }

  setReasoningEffort(win: BrowserWindow, effort: ReasoningEffort, sessionId?: string): void {
    this.effortByConv.set(convKey(win.id, sessionId), effort)
  }

  approve(win: BrowserWindow, toolCallId: string, sessionId?: string): void {
    const approvals = this.approvalsFor(convKey(win.id, sessionId))
    approvals.get(toolCallId)?.(true)
    approvals.delete(toolCallId)
  }

  reject(win: BrowserWindow, toolCallId: string, sessionId?: string): void {
    const approvals = this.approvalsFor(convKey(win.id, sessionId))
    approvals.get(toolCallId)?.(false)
    approvals.delete(toolCallId)
  }

  private cancelConv(key: string): void {
    // Drop the run token before abort()/resolving approvals so the code those
    // wake up already sees itself as not live.
    this.runByConv.delete(key)
    this.controllerByConv.get(key)?.abort()
    this.controllerByConv.delete(key)
    const approvals = this.approvalsFor(key)
    for (const resolve of approvals.values()) resolve(false)
    approvals.clear()
  }

  async testConnection(settings: BridgeSettings): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await fetch(`${settings.endpoint}/models`, {
        headers: { Authorization: `Bearer ${settings.apiKey}` },
      })
      if (!response.ok) return { ok: false, error: `HTTP ${response.status}` }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  private approvalsFor(key: string): Map<string, (approved: boolean) => void> {
    let approvals = this.pendingApprovalsByConv.get(key)
    if (!approvals) {
      approvals = new Map()
      this.pendingApprovalsByConv.set(key, approvals)
    }
    return approvals
  }

  private emit(win: BrowserWindow, sessionId: string | undefined, event: BridgeEvent): void {
    // sessionId is spread in as-is: undefined for pre-multi-session callers,
    // which toEqual/the renderer treat the same as absent.
    if (!win.isDestroyed()) win.webContents.send('bridge:event', { ...event, sessionId } satisfies BridgeSessionEvent)
  }

  private async runConversation(win: BrowserWindow, payload: BridgeSendPayload): Promise<void> {
    // Captured once, before any `await`, so every subsequent Map lookup in this
    // conversation (including inside streamOneCompletion/awaitApproval) keys off
    // the window identity as it was when the conversation started — not a
    // possibly-stale `win.id` read after the window has been disposed.
    const { cwd, settings, agentMode, sessionId } = payload
    const key = convKey(win.id, sessionId)
    // A new send supersedes any stale run still suspended on this key.
    this.cancelConv(key)
    if (settings.reasoningEffort) this.effortByConv.set(key, settings.reasoningEffort)
    else this.effortByConv.delete(key)
    const run = Symbol('bridge-run')
    this.runByConv.set(key, run)
    const live = () => this.runByConv.get(key) === run
    const emit = (event: BridgeEvent) => {
      if (live()) this.emit(win, sessionId, event)
    }

    const vide = this.videToolsFor(settings, win.id)
    const messages = [...payload.messages]
    if (messages[0]?.role !== 'system') {
      messages.unshift({ role: 'system', content: await this.systemPromptFor(key, settings.sessionId, cwd, vide.instructions, settings.rocky) })
    }
    if (!live()) return

    try {
      await this.runRounds(key, live, emit, messages, settings, agentMode, cwd, vide)
    } finally {
      if (live()) {
        this.runByConv.delete(key)
        this.controllerByConv.delete(key)
      }
    }
  }

  private async runRounds(
    key: string,
    live: () => boolean,
    emit: (event: BridgeEvent) => void,
    messages: BridgeMessage[],
    settings: BridgeSettings,
    agentMode: boolean,
    cwd: string,
    vide: VideToolSet
  ): Promise<void> {
    const limit = settings.toolCallLimit && settings.toolCallLimit > 0 ? settings.toolCallLimit : Infinity
    const tools = [...BRIDGE_TOOLS, ...vide.tools.map(toOpenAiTool)]
    // Same rule Claude's vide-todo-enforcer Stop hook applies: a run that
    // started a ticket can't finish until it has commented on it. Only
    // enforced for tickets this run started, and at most once per run.
    let startedTodo = false
    let stopBlocked = false
    // vIDE Compacting. The window is probed lazily, the first time the server
    // reports usage (servers that never do skip the probe entirely).
    let contextWindow: number | null | undefined
    let usedTokens = 0
    let overflowRetried = false
    for (let round = 0; round < limit; round++) {
      if (!live()) return
      if (round > 0) emit({ type: 'new-turn' })
      // Trimming rewrites earlier messages. Hybrid models (Qwen3.5/3.6 and
      // other Gated DeltaNet / Mamba layers) can't reuse a prompt cache past a
      // change, so on llama.cpp every trim re-reads most of the turn — far
      // more time than the freed tokens save. Llama sessions rely on
      // compaction alone.
      if (settings.agentKind !== 'llama') {
        const trimmed = trimToolPayloads(messages)
        if (trimmed) messages.splice(0, messages.length, ...trimmed)
      }
      const streamResult = await this.streamOneCompletion(key, live, emit, messages, settings, tools)
      if (streamResult === 'overflow') {
        // The server refused the prompt as too long: compact and retry once.
        if (overflowRetried) {
          emit({ type: 'error', message: "Bridge request is larger than the model's context, even after compacting" })
          return
        }
        overflowRetried = true
        if (contextWindow === undefined) contextWindow = await fetchContextWindow(settings.endpoint, settings.apiKey)
        if (!(await this.compactInTurn(key, live, emit, messages, settings, contextWindow))) return
        continue
      }
      if (streamResult === null || !live()) return // error/abort already emitted (or run superseded)
      overflowRetried = false
      if (streamResult.usedTokens !== undefined) {
        usedTokens = streamResult.usedTokens
        if (contextWindow === undefined) contextWindow = await fetchContextWindow(settings.endpoint, settings.apiKey)
        if (!live()) return
        emit({ type: 'usage', usedTokens, contextWindow, tokensPerSecond: streamResult.tokensPerSecond })
      }

      if (streamResult.toolCalls.length === 0) {
        const block = startedTodo && this.videCtx
          ? await decideStopAction(this.videCtx.dataDir, { stop_hook_active: stopBlocked })
          : null
        if (!live()) return
        if (!block) {
          emit({ type: 'done' })
          return
        }
        stopBlocked = true
        messages.push({ role: 'assistant', content: streamResult.content || null })
        messages.push({ role: 'user', content: block.reason })
        continue
      }

      messages.push({
        role: 'assistant',
        content: streamResult.content || null,
        tool_calls: streamResult.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      })

      for (const call of streamResult.toolCalls) {
        if (!live()) return
        emit({ type: 'tool-call', id: call.id, name: call.name, args: call.args })
        const approved = agentMode ? true : await this.awaitApproval(key, live, emit, call)
        // Cancelled (or superseded) while awaiting approval: run no tool and
        // report nothing — the renderer settles its own pending tool calls on Stop.
        if (!live()) return
        if (call.name === 'start_todo') startedTodo = true
        const execResult = approved
          ? await this.executeTool(call.name, call.args, cwd, vide)
          : { result: 'Rejected by user.', isError: true }

        emit({ type: 'tool-result', id: call.id, result: execResult.result, isError: execResult.isError })
        messages.push({ role: 'tool', tool_call_id: call.id, content: execResult.result })
        // Rough token estimate for what the next request adds on top of the
        // last reported usage (~3 chars per token).
        usedTokens += Math.ceil(execResult.result.length / 3)

        if (!live()) return
      }

      const compactAt = compactThreshold(contextWindow ?? null, settings.compactAtTokens)
      if (compactAt !== null && usedTokens >= compactAt) {
        if (!(await this.compactInTurn(key, live, emit, messages, settings, contextWindow))) return
        usedTokens = 0
      }
    }

    emit({ type: 'error', message: `Bridge hit the ${limit} tool-call round limit for this turn` })
  }

  // Replaces `messages` in place with summary + recent rounds. Returns false
  // (with an error already emitted, unless cancelled) when it couldn't.
  private async compactInTurn(
    key: string,
    live: () => boolean,
    emit: (event: BridgeEvent) => void,
    messages: BridgeMessage[],
    settings: BridgeSettings,
    contextWindow: number | null
  ): Promise<boolean> {
    if (!live()) return false
    emit({ type: 'compacting' })
    const controller = new AbortController()
    this.controllerByConv.set(key, controller)
    let summary: string
    try {
      summary = await summarize(settings, messages, contextWindow, controller.signal)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') emit({ type: 'error', message: `Compaction failed: ${(err as Error).message}` })
      return false
    }
    if (!live()) return false
    messages.splice(0, messages.length, ...compactMessages(messages, summary))
    emit({ type: 'compacted', summary, content: wrapSummary(summary) })
    return true
  }

  // Manual Compact (activity bar / session menu) between turns: summarises
  // the wire transcript the renderer sends and returns the summary.
  async compact(payload: BridgeCompactPayload): Promise<{ ok: true; summary: string; content: string } | { ok: false; error: string }> {
    try {
      const contextWindow = await fetchContextWindow(payload.settings.endpoint, payload.settings.apiKey)
      const summary = await summarize(payload.settings, payload.messages, contextWindow, undefined, payload.focus)
      return { ok: true, summary, content: wrapSummary(summary) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  private awaitApproval(
    key: string,
    live: () => boolean,
    emit: (event: BridgeEvent) => void,
    call: PendingToolCall
  ): Promise<boolean> {
    if (!live()) return Promise.resolve(false)
    emit({ type: 'need-approval', id: call.id, name: call.name, args: call.args })
    return new Promise((resolve) => {
      this.approvalsFor(key).set(call.id, resolve)
    })
  }

  private async executeTool(name: string, args: Record<string, unknown>, cwd: string, vide: VideToolSet): Promise<ToolExecutionResult> {
    try {
      const videTool = vide.tools.find((t) => t.name === name)
      if (videTool) return { result: toolResultText(await videTool.handler(args)), isError: false }
      switch (name) {
        case 'read_file': {
          const path = args.path as string
          const content = await readFile(path, 'utf-8')
          const { startLine, endLine } = args as { startLine?: number; endLine?: number }
          const lines = content.split('\n')
          if (startLine === undefined && endLine === undefined) {
            if (lines.length <= READ_FILE_LINE_CAP) return { result: content, isError: false }
            // A whole-file read of a big file would flood a small model's
            // context; return the head plus how to get the rest.
            const hint = /\.(md|markdown|mdx)$/i.test(path)
              ? 'Use doc_outline + read_doc_section to read the section you need, or read_file with startLine/endLine.'
              : 'Use read_file with startLine/endLine to read further.'
            return {
              result: `${lines.slice(0, READ_FILE_LINE_CAP).join('\n')}\n[showing lines 1-${READ_FILE_LINE_CAP} of ${lines.length}. ${hint}]`,
              isError: false,
            }
          }
          const start = Math.max(1, startLine ?? 1)
          const end = Math.min(lines.length, endLine ?? lines.length)
          return { result: `[${path} lines ${start}-${end} of ${lines.length}]\n${lines.slice(start - 1, end).join('\n')}`, isError: false }
        }
        case 'write_file': {
          await writeFile(args.path as string, args.content as string, 'utf-8')
          return { result: `Wrote ${(args.content as string).length} bytes to ${args.path}`, isError: false }
        }
        case 'list_dir': {
          const entries = await buildTree(args.path as string)
          return { result: JSON.stringify(entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory }))), isError: false }
        }
        case 'grep_search': {
          const matches = await searchText(args.root as string, args.query as string, Boolean(args.caseSensitive))
          return { result: JSON.stringify(matches), isError: false }
        }
        case 'run_command': {
          try {
            const { stdout, stderr } = await execFileAsync('/bin/zsh', ['-lc', args.command as string], {
              cwd,
              timeout: 60_000,
              maxBuffer: 10 * 1024 * 1024,
            })
            return { result: `${stdout}${stderr}`.trim() || '(no output)', isError: false }
          } catch (err) {
            const e = err as { stdout?: string; stderr?: string; message: string }
            return { result: `${e.stdout ?? ''}${e.stderr ?? ''}\n${e.message}`.trim(), isError: true }
          }
        }
        case 'edit_file': {
          const path = args.path as string
          const oldString = args.old_string as string
          const newString = args.new_string as string
          const content = await readFile(path, 'utf-8')
          const occurrences = content.split(oldString).length - 1
          if (occurrences === 0) {
            // Auto-include fresh file content so the model can self-correct without another tool call
            const firstKeyword = oldString.trim().split('\n')[0].trim().slice(0, 40)
            const lines = content.split('\n')
            const nearIdx = lines.findIndex(l => l.includes(firstKeyword.slice(0, 25)))
            const section = nearIdx !== -1
              ? lines.slice(Math.max(0, nearIdx - 3), nearIdx + 15)
                  .map((l, i) => `${Math.max(1, nearIdx - 2) + i}: ${l}`)
                  .join('\n')
              : lines.slice(0, Math.min(lines.length, 80))
                  .map((l, i) => `${i + 1}: ${l}`)
                  .join('\n')
            return {
              result: `old_string not found in ${path}. Your old_string had a whitespace or content mismatch.\n\nHere is the actual file content — use these exact lines (with exact leading spaces) to build a new old_string:\n\n${section}`,
              isError: true,
            }
          }
          if (occurrences > 1) {
            return {
              result: `old_string appears ${occurrences} times in ${path} — include more surrounding context to make it unique`,
              isError: true,
            }
          }
          const idx = content.indexOf(oldString)
          const updated = content.slice(0, idx) + newString + content.slice(idx + oldString.length)
          await writeFile(path, updated, 'utf-8')
          return { result: `Edited ${path}`, isError: false }
        }
        case 'create_file': {
          const path = args.path as string
          const content = args.content as string
          try {
            await writeFile(path, content, { encoding: 'utf-8', flag: 'wx' })
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
              return { result: `${path} already exists — use edit_file or write_file`, isError: true }
            }
            throw err
          }
          return { result: `Created ${path}`, isError: false }
        }
        case 'glob_search': {
          const root = args.root as string
          const pattern = args.pattern as string
          const IGNORED_SEGMENTS = new Set(['node_modules', '.git', 'dist', 'out'])
          const allFiles = await listAllFiles(root)
          const candidates = allFiles.filter((f) => {
            const rel = relative(root, f)
            return !rel.split(/[\\/]/).some((segment) => IGNORED_SEGMENTS.has(segment))
          })
          const allMatches = candidates.filter((f) => minimatch(relative(root, f), pattern))
          const GLOB_MATCH_CAP = 300
          const matches = allMatches.slice(0, GLOB_MATCH_CAP)
          const truncated = allMatches.length > GLOB_MATCH_CAP
          return {
            result: JSON.stringify({ matches, truncated, totalMatches: allMatches.length }),
            isError: false,
          }
        }
        case 'delete_file': {
          const path = args.path as string
          await unlink(path)
          return { result: `Deleted ${path}`, isError: false }
        }
        case 'move_file': {
          const from = args.from as string
          const to = args.to as string
          const destExists = await access(to).then(() => true).catch(() => false)
          if (destExists) {
            return { result: `${to} already exists — delete it first or choose another destination`, isError: true }
          }
          await rename(from, to)
          return { result: `Moved ${from} to ${to}`, isError: false }
        }
        default:
          return { result: `Unknown tool: ${name}`, isError: true }
      }
    } catch (err) {
      return { result: (err as Error).message, isError: true }
    }
  }

  private async streamOneCompletion(
    key: string,
    live: () => boolean,
    emit: (event: BridgeEvent) => void,
    messages: BridgeMessage[],
    settings: BridgeSettings,
    tools: unknown[]
  ): Promise<StreamResult | 'overflow' | null> {
    if (!live()) return null
    const controller = new AbortController()
    this.controllerByConv.set(key, controller)

    let response: Response
    try {
      const reqHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      }
      if (settings.sessionId) reqHeaders['X-Bridge-Session-ID'] = settings.sessionId
      const effort = this.effortByConv.get(key)
      response = await fetch(`${settings.endpoint}/chat/completions`, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({
          model: settings.modelId,
          messages,
          tools,
          stream: true,
          stream_options: { include_usage: true },
          ...(effort ? { reasoning_effort: effort } : {}),
        }),
        signal: controller.signal,
      })
    } catch (err) {
      // An abort (Stop/Clear/supersede) is not a failure worth reporting —
      // and `emit` already drops anything once the run is no longer live.
      if ((err as Error).name !== 'AbortError') {
        emit({ type: 'error', message: `Bridge request failed: ${(err as Error).message}` })
      }
      return null
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      if (isContextOverflow(response.status, body)) return 'overflow'
      emit({ type: 'error', message: `Bridge request failed: ${response.status}` })
      return null
    }

    if (!response.body) {
      emit({ type: 'error', message: 'Bridge response had no body' })
      return null
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    let usedTokens: number | undefined
    let completionTokens: number | undefined
    let serverTokensPerSecond: number | undefined
    // First and last streamed token, for tokens/s when the server has no timings.
    let firstTokenAt: number | undefined
    let lastTokenAt = 0
    const toolCallAccs: Record<number, { id: string; name: string; args: string }> = {}
    const thinkSplitter = new ThinkTagSplitter()
    const emitSplit = ({ text, reasoning }: { text: string; reasoning: string }) => {
      if (reasoning) emit({ type: 'reasoning-delta', delta: reasoning })
      if (text) {
        content += text
        emit({ type: 'text-delta', delta: text })
      }
    }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const chunk = parseSSEChunk(line)
          if (!chunk) continue
          if (chunk.usage?.prompt_tokens !== undefined) {
            usedTokens = chunk.usage.prompt_tokens + (chunk.usage.completion_tokens ?? 0)
            completionTokens = chunk.usage.completion_tokens
          }
          if (chunk.timings?.predicted_per_second) serverTokensPerSecond = chunk.timings.predicted_per_second
          const delta = chunk.choices?.[0]?.delta
          if (delta && (delta.content || delta.reasoning_content || delta.reasoning || delta.tool_calls)) {
            lastTokenAt = Date.now()
            firstTokenAt ??= lastTokenAt
          }
          const reasoningDelta = delta?.reasoning_content ?? delta?.reasoning
          if (reasoningDelta) emit({ type: 'reasoning-delta', delta: reasoningDelta })
          if (delta?.content) emitSplit(thinkSplitter.push(delta.content))
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const acc = toolCallAccs[tc.index] ?? { id: '', name: '', args: '' }
              if (tc.id) acc.id = tc.id
              if (tc.function?.name) acc.name = tc.function.name
              if (tc.function?.arguments) acc.args += tc.function.arguments
              toolCallAccs[tc.index] = acc
            }
          }
        }
      }
      emitSplit(thinkSplitter.flush())
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        emit({ type: 'error', message: `Bridge stream error: ${(err as Error).message}` })
      }
      return null
    }

    const elapsedMs = firstTokenAt !== undefined ? lastTokenAt - firstTokenAt : 0
    const tokensPerSecond = serverTokensPerSecond
      ?? (completionTokens && elapsedMs > 0 ? completionTokens / (elapsedMs / 1000) : undefined)

    const toolCalls: PendingToolCall[] = Object.values(toolCallAccs).map((acc) => {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(acc.args || '{}')
      } catch {
        args = {}
      }
      return { id: acc.id, name: acc.name, args }
    })

    // Strip [Calling ... tokens the model emits as plain text before making real tool calls
    const stripped = content.split('\n').filter(l => !l.trimStart().startsWith('[Calling')).join('\n').trim()
    if (stripped !== content) {
      content = stripped
      emit({ type: 'content-replace', content })
    }

    // Fallback: model emitted tool call as plain-text JSON instead of via tool_calls delta
    if (toolCalls.length === 0 && content) {
      const { toolCalls: textCalls, cleanedContent } = extractTextToolCalls(content)
      if (textCalls.length > 0) {
        emit({ type: 'content-replace', content: cleanedContent })
        return { content: cleanedContent, toolCalls: textCalls, usedTokens, tokensPerSecond }
      }
    }

    return { content, toolCalls, usedTokens, tokensPerSecond }
  }

  disposeWindow(winId: number): void {
    const prefix = `${winId}:`
    const keys = new Set([
      ...this.controllerByConv.keys(),
      ...this.pendingApprovalsByConv.keys(),
      ...this.runByConv.keys(),
    ])
    for (const key of keys) {
      if (!key.startsWith(prefix)) continue
      // cancelConv deletes the run token, so any runConversation loop still
      // suspended at an await for this window wakes up not-live and stops.
      this.cancelConv(key)
      this.controllerByConv.delete(key)
      this.pendingApprovalsByConv.delete(key)
      this.effortByConv.delete(key)
      this.systemPromptByConv.delete(key)
    }
  }
}
