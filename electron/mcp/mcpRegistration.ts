import { app, ipcMain } from 'electron'
import { execFile } from 'child_process'
import { join } from 'path'

export const MCP_SERVER_NAME = 'vide-todos'

function run(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve({ stdout: String(stdout), stderr: String(stderr) })
    })
  })
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
  ipcMain.handle('todos:mcp:enable', () => enableTodoMcp())
  ipcMain.handle('todos:mcp:disable', () => disableTodoMcp())
}
