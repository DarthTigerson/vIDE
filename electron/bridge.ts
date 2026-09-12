import { app, BrowserWindow, ipcMain } from 'electron'
import { readFile, writeFile, unlink, rename, access } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join, relative } from 'path'
import { listAllFiles, searchText, buildTree } from './fsOps'
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
}

export interface BridgeSendPayload {
  cwd: string
  messages: BridgeMessage[]
  agentMode: boolean
  settings: BridgeSettings
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
  | { type: 'content-replace'; content: string }
  | { type: 'tool-call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'need-approval'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool-result'; id: string; result: string; isError: boolean }
  | { type: 'new-turn' }
  | { type: 'done' }
  | { type: 'error'; message: string }

interface StreamChunkDelta {
  content?: string
  tool_calls?: Array<{
    index: number
    id?: string
    function?: { name?: string; arguments?: string }
  }>
}

interface StreamChunk {
  choices: Array<{ delta: StreamChunkDelta; finish_reason: string | null }>
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

const MAX_TOOL_ROUNDS = 40

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

const FILE_TOOL_GUIDANCE =
  'When modifying an existing file, prefer edit_file over write_file. Full-file rewrites waste tokens, fail on large files, and risk changing untouched code. ' +
  'Use this priority order: (1) edit_file for any change to an existing file, (2) write_file only for complete rewrites explicitly requested by the user, ' +
  "(3) create_file only for files that don't exist yet."

async function buildSystemPrompt(cwd: string): Promise<string> {
  let branch = ''
  let lastCommit = ''
  try {
    const branchResult = await execFileAsync('git', ['branch', '--show-current'], { cwd, timeout: 5000 })
    branch = branchResult.stdout.trim()
    const logResult = await execFileAsync('git', ['log', '-1', '--pretty=format:%h %s (%ar)'], { cwd, timeout: 5000 })
    lastCommit = logResult.stdout.trim()
  } catch {}

  return `You are Bridge, an AI coding assistant running inside a local IDE. You have DIRECT access to the user's machine through function/tool calls.

Project directory: ${cwd}${branch ? `\nCurrent branch: ${branch}` : ''}${lastCommit ? `\nLast commit: ${lastCommit}` : ''}

== TOOLS ==
You have the following tools. Use them — do not explain how the user could run commands themselves.

- read_file(path, startLine?, endLine?) — read a file. path must be the FULL absolute path returned by a previous search. For files under ~400 lines, read the whole file first (no startLine/endLine) to understand the full structure before editing. Only use startLine/endLine on large files you've already read once, and always read at least 80 lines of context — narrow ranges miss the surrounding structure needed for correct edits.
- write_file(path, content) — overwrite a file
- edit_file(path, old_string, new_string) — patch a file. path must be the FULL absolute path.
- create_file(path, content) — create a new file
- delete_file(path) — delete a file
- move_file(from, to) — rename/move a file
- list_dir(path) — list directory contents
- grep_search(root, query, caseSensitive?) — search for text in files. caseSensitive defaults to false.
- glob_search(pattern, root) — find files by glob pattern (e.g. "**/*.tsx", "**/*Git*")
- run_command(command) — execute any shell command in the project directory

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
${FILE_TOOL_GUIDANCE}`
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
  private controllerByWindow = new Map<number, AbortController>()
  private pendingApprovalsByWindow = new Map<number, Map<string, (approved: boolean) => void>>()
  private cancelledByWindow = new Map<number, boolean>()

  registerHandlers(): void {
    ipcMain.on('bridge:send', (event, payload: BridgeSendPayload) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      // Returning the promise (instead of `void`-discarding it) is what lets
      // tests capture and await it via the mocked ipcMain.on handler map —
      // Electron itself ignores the return value either way.
      return this.send(win, payload)
    })

    ipcMain.on('bridge:cancel', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      this.cancel(win)
    })

    ipcMain.on('bridge:approve', (event, toolCallId: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      this.approve(win, toolCallId)
    })

    ipcMain.on('bridge:reject', (event, toolCallId: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      this.reject(win, toolCallId)
    })

    ipcMain.handle('bridge:testConnection', (_event, settings: BridgeSettings) => this.testConnection(settings))
  }

  // The following are the same bodies that used to live directly inside the
  // ipcMain closures above, extracted so the mobile relay (bridgeChannels.ts)
  // can call the exact same logic for a mobile-originated conversation,
  // keyed off the same sentinel window the relay uses for term/claude
  // sessions (MOBILE_RELAY_WINDOW_ID) rather than a real event.sender.

  send(win: BrowserWindow, payload: BridgeSendPayload): Promise<void> {
    return this.runConversation(win, payload)
  }

  cancel(win: BrowserWindow): void {
    this.controllerByWindow.get(win.id)?.abort()
    this.cancelledByWindow.set(win.id, true)
    const approvals = this.approvalsFor(win.id)
    for (const resolve of approvals.values()) {
      resolve(false)
    }
    approvals.clear()
  }

  approve(win: BrowserWindow, toolCallId: string): void {
    const approvals = this.approvalsFor(win.id)
    approvals.get(toolCallId)?.(true)
    approvals.delete(toolCallId)
  }

  reject(win: BrowserWindow, toolCallId: string): void {
    const approvals = this.approvalsFor(win.id)
    approvals.get(toolCallId)?.(false)
    approvals.delete(toolCallId)
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

  private approvalsFor(winId: number): Map<string, (approved: boolean) => void> {
    let approvals = this.pendingApprovalsByWindow.get(winId)
    if (!approvals) {
      approvals = new Map()
      this.pendingApprovalsByWindow.set(winId, approvals)
    }
    return approvals
  }

  private emit(win: BrowserWindow, event: BridgeEvent): void {
    if (!win.isDestroyed()) win.webContents.send('bridge:event', event)
  }

  private async runConversation(win: BrowserWindow, payload: BridgeSendPayload): Promise<void> {
    // Captured once, before any `await`, so every subsequent Map lookup in this
    // conversation (including inside streamOneCompletion/awaitApproval) keys off
    // the window identity as it was when the conversation started — not a
    // possibly-stale `win.id` read after the window has been disposed.
    const winId = win.id
    this.cancelledByWindow.set(winId, false)
    const { cwd, settings, agentMode } = payload
    const messages = [...payload.messages]
    if (messages[0]?.role !== 'system') {
      messages.unshift({ role: 'system', content: await buildSystemPrompt(cwd) })
    }

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (round > 0) this.emit(win, { type: 'new-turn' })
      const streamResult = await this.streamOneCompletion(win, winId, messages, settings)
      if (streamResult === null) return // error or abort already emitted

      if (streamResult.toolCalls.length === 0) {
        this.emit(win, { type: 'done' })
        return
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
        this.emit(win, { type: 'tool-call', id: call.id, name: call.name, args: call.args })
        const approved = agentMode ? true : await this.awaitApproval(win, winId, call)
        const execResult = approved
          ? await this.executeTool(call.name, call.args, cwd)
          : { result: 'Rejected by user.', isError: true }

        this.emit(win, { type: 'tool-result', id: call.id, result: execResult.result, isError: execResult.isError })
        messages.push({ role: 'tool', tool_call_id: call.id, content: execResult.result })

        if (this.cancelledByWindow.get(winId)) return
      }

      if (this.cancelledByWindow.get(winId)) return
    }

    this.emit(win, { type: 'error', message: `Bridge hit the ${MAX_TOOL_ROUNDS} tool-call round limit for this turn` })
  }

  private awaitApproval(win: BrowserWindow, winId: number, call: PendingToolCall): Promise<boolean> {
    this.emit(win, { type: 'need-approval', id: call.id, name: call.name, args: call.args })
    return new Promise((resolve) => {
      this.approvalsFor(winId).set(call.id, resolve)
    })
  }

  private async executeTool(name: string, args: Record<string, unknown>, cwd: string): Promise<ToolExecutionResult> {
    try {
      switch (name) {
        case 'read_file': {
          const content = await readFile(args.path as string, 'utf-8')
          const { startLine, endLine } = args as { startLine?: number; endLine?: number }
          if (startLine === undefined && endLine === undefined) {
            return { result: content, isError: false }
          }
          const lines = content.split('\n')
          const start = Math.max(1, startLine ?? 1)
          const end = Math.min(lines.length, endLine ?? lines.length)
          return { result: lines.slice(start - 1, end).join('\n'), isError: false }
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
    win: BrowserWindow,
    winId: number,
    messages: BridgeMessage[],
    settings: BridgeSettings
  ): Promise<{ content: string; toolCalls: PendingToolCall[] } | null> {
    const controller = new AbortController()
    this.controllerByWindow.set(winId, controller)

    let response: Response
    try {
      const reqHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      }
      if (settings.sessionId) reqHeaders['X-Bridge-Session-ID'] = settings.sessionId
      response = await fetch(`${settings.endpoint}/chat/completions`, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({ model: settings.modelId, messages, tools: BRIDGE_TOOLS, stream: true }),
        signal: controller.signal,
      })
    } catch (err) {
      this.emit(win, { type: 'error', message: `Bridge request failed: ${(err as Error).message}` })
      return null
    }

    if (!response.ok) {
      this.emit(win, { type: 'error', message: `Bridge request failed: ${response.status}` })
      return null
    }

    if (!response.body) {
      this.emit(win, { type: 'error', message: 'Bridge response had no body' })
      return null
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    const toolCallAccs: Record<number, { id: string; name: string; args: string }> = {}

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
          const delta = chunk.choices[0]?.delta
          if (delta?.content) {
            content += delta.content
            this.emit(win, { type: 'text-delta', delta: delta.content })
          }
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
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        this.emit(win, { type: 'error', message: `Bridge stream error: ${(err as Error).message}` })
      }
      return null
    }

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
      this.emit(win, { type: 'content-replace', content })
    }

    // Fallback: model emitted tool call as plain-text JSON instead of via tool_calls delta
    if (toolCalls.length === 0 && content) {
      const { toolCalls: textCalls, cleanedContent } = extractTextToolCalls(content)
      if (textCalls.length > 0) {
        this.emit(win, { type: 'content-replace', content: cleanedContent })
        return { content: cleanedContent, toolCalls: textCalls }
      }
    }

    return { content, toolCalls }
  }

  disposeWindow(winId: number): void {
    this.controllerByWindow.get(winId)?.abort()
    this.controllerByWindow.delete(winId)
    const approvals = this.pendingApprovalsByWindow.get(winId)
    if (approvals) {
      for (const resolve of approvals.values()) {
        resolve(false)
      }
      approvals.clear()
    }
    this.pendingApprovalsByWindow.delete(winId)
    // Set (not delete) so any `runConversation` loop still suspended at an
    // `await` for this window sees cancellation as true rather than
    // `undefined` (falsy) — a `delete` here would let it keep executing tool
    // calls (and would let `streamOneCompletion` silently repopulate
    // controllerByWindow) on behalf of a window that no longer exists.
    this.cancelledByWindow.set(winId, true)
  }
}
