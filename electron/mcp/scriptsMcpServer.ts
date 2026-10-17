import { McpStdioServer } from './protocol'
import { buildScriptsTools, socketRunner } from './scriptsTools'

const dataDir = process.env.VIDE_SCRIPTS_DATA_DIR
if (!dataDir) {
  process.stderr.write('VIDE_SCRIPTS_DATA_DIR is not set\n')
  process.exit(1)
}

// Like vide-notes, reading and writing works from any session through the
// registered data dir. Running needs the live window, which — like
// vide-browser — is only known when this was spawned by a vIDE Claude panel
// (VIDE_WINDOW_ID / VIDE_BROWSER_SHIM_SOCK inherited from its env).
const windowId = process.env.VIDE_WINDOW_ID
const socketPath = process.env.VIDE_BROWSER_SHIM_SOCK
const run = windowId && socketPath ? socketRunner(socketPath, windowId) : undefined

new McpStdioServer({
  name: 'vide-scripts',
  version: '1.0.0',
  instructions:
    "These are the user's saved routines (shell scripts with a title and a description of when to use them). " +
    'When the user asks for something a script describes, offer or use run_script instead of retyping its commands. ' +
    'When asked to write or fix a routine, use create_script / update_script. You cannot delete scripts.',
  tools: buildScriptsTools(dataDir, run),
  input: process.stdin,
  output: process.stdout,
}).start()
