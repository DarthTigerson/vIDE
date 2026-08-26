import { McpStdioServer } from './protocol'
import { buildTodoTools } from './todoTools'

// Standalone entry point spawned directly by the `claude` CLI over stdio (see
// mcpRegistration.ts) — this runs outside Electron entirely (via
// ELECTRON_RUN_AS_NODE=1), so it must not import anything from 'electron'.
// The userData directory is passed in as an env var rather than resolved via
// app.getPath, which isn't available here.
const dataDir = process.env.VIDE_TODOS_DATA_DIR
if (!dataDir) {
  process.stderr.write('VIDE_TODOS_DATA_DIR is not set\n')
  process.exit(1)
}

new McpStdioServer({
  name: 'vide-todos',
  version: '1.0.0',
  tools: buildTodoTools(dataDir),
  input: process.stdin,
  output: process.stdout,
}).start()
