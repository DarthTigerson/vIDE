import { app, ipcMain } from 'electron'
import { execFile } from 'child_process'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'

export const MCP_SERVER_NAME = 'vide-todos'
export const NOTES_MCP_SERVER_NAME = 'vide-notes'
export const BROWSER_MCP_SERVER_NAME = 'vide-browser'

function run(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve({ stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

// `claude` is typically only resolvable through the user's own login shell
// (nvm, homebrew, etc. modify PATH in shell profiles, not in the environment
// Electron itself inherits) — same reasoning as the interactive spawn in
// electron/claude.ts, but here we only need the resolved absolute path, not
// an interactive session.
async function resolveClaudeBinary(): Promise<string> {
  const shell = process.env.SHELL ?? '/bin/zsh'
  const { stdout } = await run(shell, ['-lic', 'command -v claude'])
  const path = stdout.trim().split('\n').pop()
  if (!path) throw new Error("'claude' was not found in PATH — install the Claude Code CLI first")
  return path
}

export const ENFORCER_PLUGIN_NAME = 'vide-todo-enforcer'
export const ENFORCER_MARKETPLACE_NAME = 'vide-marketplace'

function enforcerMarketplaceDir(): string {
  return join(app.getPath('userData'), 'todo-enforcer-plugin', ENFORCER_MARKETPLACE_NAME)
}

function enforcerPluginDir(): string {
  return join(enforcerMarketplaceDir(), 'plugins', ENFORCER_PLUGIN_NAME)
}

function enforcerHookScriptPath(): string {
  return join(__dirname, 'todoEnforcerHookMain.js')
}

// Generates the marketplace + plugin + hooks.json files vide-todo-enforcer
// needs, entirely under userData. Hook command entries can't declare their
// own env vars, so the ELECTRON_RUN_AS_NODE=1 the hook process needs (same
// requirement as todoMcpServer.js) is baked directly into the generated
// shell command string, along with the resolved data directory — both
// values vIDE already knows at generation time, so there's no need to rely
// on ${CLAUDE_PLUGIN_ROOT}-style placeholder resolution.
async function writeEnforcerPluginFiles(): Promise<void> {
  const description =
    'Blocks Claude from ending a turn until it has logged a progress comment on the vIDE todo ticket it started working on.'

  const marketplaceClaudePluginDir = join(enforcerMarketplaceDir(), '.claude-plugin')
  await mkdir(marketplaceClaudePluginDir, { recursive: true })
  await writeFile(
    join(marketplaceClaudePluginDir, 'marketplace.json'),
    JSON.stringify(
      {
        name: ENFORCER_MARKETPLACE_NAME,
        owner: { name: 'vIDE' },
        plugins: [{ name: ENFORCER_PLUGIN_NAME, source: `./plugins/${ENFORCER_PLUGIN_NAME}`, description }],
      },
      null,
      2
    )
  )

  const pluginClaudePluginDir = join(enforcerPluginDir(), '.claude-plugin')
  await mkdir(pluginClaudePluginDir, { recursive: true })
  await writeFile(
    join(pluginClaudePluginDir, 'plugin.json'),
    JSON.stringify({ name: ENFORCER_PLUGIN_NAME, description, version: '1.0.0' }, null, 2)
  )

  const hooksDir = join(enforcerPluginDir(), 'hooks')
  await mkdir(hooksDir, { recursive: true })
  const execPath = shQuote(process.execPath)
  const command =
    `[ -x ${execPath} ] || exit 0; ` +
    `ELECTRON_RUN_AS_NODE=1 ${execPath} ${shQuote(enforcerHookScriptPath())} ${shQuote(app.getPath('userData'))}`
  await writeFile(
    join(hooksDir, 'hooks.json'),
    JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command }] }] } }, null, 2)
  )
}

export async function enableTodoEnforcerPlugin(): Promise<void> {
  await writeEnforcerPluginFiles()
  const claudeBin = await resolveClaudeBinary()
  try {
    await run(claudeBin, ['plugin', 'marketplace', 'add', enforcerMarketplaceDir()])
  } catch {
    // already added — fine, installing below still picks up any file changes
  }
  await run(claudeBin, [
    'plugin',
    'install',
    `${ENFORCER_PLUGIN_NAME}@${ENFORCER_MARKETPLACE_NAME}`,
    '--scope',
    'user',
  ])
}

// Best-effort, matching disableTodoMcp's style: turning the toggle off
// should always succeed locally even if nothing was actually installed.
export async function disableTodoEnforcerPlugin(): Promise<void> {
  try {
    const claudeBin = await resolveClaudeBinary()
    await run(claudeBin, ['plugin', 'uninstall', `${ENFORCER_PLUGIN_NAME}@${ENFORCER_MARKETPLACE_NAME}`])
  } catch {
    // ignore — nothing to clean up, or claude isn't on PATH anymore
  }
}

function scriptPath(): string {
  return join(__dirname, 'todoMcpServer.js')
}

// Registered at user scope (not project scope) so it's available in every
// vIDE-launched Claude Code session regardless of which repo is open, and so
// it never writes an .mcp.json into the user's project directories. Runs via
// Electron's own bundled binary in ELECTRON_RUN_AS_NODE mode rather than a
// system `node`, so it works for packaged installs where Node isn't
// necessarily installed, and can still read the script out of app.asar.
export async function enableTodoMcp(): Promise<void> {
  const claudeBin = await resolveClaudeBinary()
  // Remove first so re-enabling always works even if already registered
  try { await run(claudeBin, ['mcp', 'remove', MCP_SERVER_NAME, '--scope', 'user']) } catch { /* not registered */ }
  await run(claudeBin, [
    'mcp',
    'add',
    MCP_SERVER_NAME,
    '--scope',
    'user',
    '-e',
    `VIDE_TODOS_DATA_DIR=${app.getPath('userData')}`,
    '-e',
    'ELECTRON_RUN_AS_NODE=1',
    '--',
    process.execPath,
    scriptPath(),
  ])
}

// Best-effort: turning the toggle off should always succeed locally even if
// the server was never actually registered (e.g. a previous enable failed).
export async function disableTodoMcp(): Promise<void> {
  try {
    const claudeBin = await resolveClaudeBinary()
    await run(claudeBin, ['mcp', 'remove', MCP_SERVER_NAME, '--scope', 'user'])
  } catch {
    // ignore — nothing to clean up, or claude isn't on PATH anymore
  }
}

export function registerTodoMcpHandlers(): void {
  ipcMain.handle('todos:mcp:enable', async () => {
    await enableTodoMcp()
    try {
      await enableTodoEnforcerPlugin()
    } catch (err) {
      console.error(
        'Failed to install the todo-enforcer plugin — Claude can still see and manage todos via MCP, ' +
          'but the progress-comment enforcement hook is not active:',
        err
      )
    }
  })
  ipcMain.handle('todos:mcp:disable', () => Promise.all([disableTodoMcp(), disableTodoEnforcerPlugin()]))
}

function notesMcpScriptPath(): string {
  return join(__dirname, 'notesMcpServer.js')
}

export async function enableNotesMcp(): Promise<void> {
  const claudeBin = await resolveClaudeBinary()
  // Remove first so re-enabling always works even if already registered
  try { await run(claudeBin, ['mcp', 'remove', NOTES_MCP_SERVER_NAME, '--scope', 'user']) } catch { /* not registered */ }
  await run(claudeBin, [
    'mcp',
    'add',
    NOTES_MCP_SERVER_NAME,
    '--scope',
    'user',
    '-e',
    `VIDE_NOTES_DATA_DIR=${app.getPath('userData')}`,
    '-e',
    'ELECTRON_RUN_AS_NODE=1',
    '--',
    process.execPath,
    notesMcpScriptPath(),
  ])
}

export async function disableNotesMcp(): Promise<void> {
  try {
    const claudeBin = await resolveClaudeBinary()
    await run(claudeBin, ['mcp', 'remove', NOTES_MCP_SERVER_NAME, '--scope', 'user'])
  } catch {
    // ignore
  }
}

export function registerNotesMcpHandlers(): void {
  ipcMain.handle('notes:mcp:enable', () => enableNotesMcp())
  ipcMain.handle('notes:mcp:disable', () => disableNotesMcp())
}

function browserMcpScriptPath(): string {
  return join(__dirname, 'browserMcpServer.js')
}

// No `-e`-registered data dir here, unlike todos/notes — this server's
// per-window state (VIDE_WINDOW_ID / VIDE_BROWSER_SHIM_SOCK) comes from
// inheriting the `claude` CLI process's own environment at spawn time
// (see browserMcpServer.ts), not from anything fixed at registration time.
export async function enableBrowserMcp(): Promise<void> {
  const claudeBin = await resolveClaudeBinary()
  // Remove first so re-enabling always works even if already registered
  try { await run(claudeBin, ['mcp', 'remove', BROWSER_MCP_SERVER_NAME, '--scope', 'user']) } catch { /* not registered */ }
  await run(claudeBin, [
    'mcp',
    'add',
    BROWSER_MCP_SERVER_NAME,
    '--scope',
    'user',
    '-e',
    'ELECTRON_RUN_AS_NODE=1',
    '--',
    process.execPath,
    browserMcpScriptPath(),
  ])
}

export async function disableBrowserMcp(): Promise<void> {
  try {
    const claudeBin = await resolveClaudeBinary()
    await run(claudeBin, ['mcp', 'remove', BROWSER_MCP_SERVER_NAME, '--scope', 'user'])
  } catch {
    // ignore
  }
}

export function registerBrowserMcpHandlers(): void {
  ipcMain.handle('browser:mcp:enable', () => enableBrowserMcp())
  ipcMain.handle('browser:mcp:disable', () => disableBrowserMcp())
}
