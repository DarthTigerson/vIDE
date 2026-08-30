import { McpStdioServer } from './protocol'
import { buildBrowserTools } from './browserTools'

// Unlike vide-todos/vide-notes (which read/write flat files under a data
// dir known at registration time), this server needs per-window state that
// only exists in the running vIDE app — so instead of a `-e`-registered
// value, it relies on inheriting VIDE_WINDOW_ID / VIDE_BROWSER_SHIM_SOCK
// from the `claude` CLI process's own environment (set per-spawn in
// electron/claude.ts). Confirmed empirically that a claude-spawned MCP
// subprocess does inherit its parent's env, not just the `-e` values passed
// to `claude mcp add` (see VIDE-53 design note).
const windowId = process.env.VIDE_WINDOW_ID
const socketPath = process.env.VIDE_BROWSER_SHIM_SOCK
if (!windowId || !socketPath) {
  process.stderr.write(
    'VIDE_WINDOW_ID / VIDE_BROWSER_SHIM_SOCK are not set — this only works when spawned as a subprocess of ' +
      'a vIDE-launched claude session.\n'
  )
  process.exit(1)
}

new McpStdioServer({
  name: 'vide-browser',
  version: '1.0.0',
  instructions:
    'These tools drive a single browser tab inside the vIDE app itself — a real alternative to any ' +
    'browser-automation extension, with no separate install needed. Prefer these over asking the user to ' +
    'install one.',
  tools: buildBrowserTools(socketPath, windowId),
  input: process.stdin,
  output: process.stdout,
}).start()
