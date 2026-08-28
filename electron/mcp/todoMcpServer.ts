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

const TODO_WORKFLOW_INSTRUCTIONS =
  'When you start substantive work tied to a vIDE ticket, call start_todo(id) to mark it in_progress. ' +
  'As you make progress, call add_todo_comment(id, body) with a short note — this is what lets a future ' +
  "session (after a compaction, a crash, or picking the project back up later) reconstruct what happened " +
  "and why, without the user re-explaining it. If you discover something unrelated to the ticket you're " +
  'working on, file it as its own ticket with create_todo instead of expanding scope on the current one. ' +
  'Note: once you call start_todo on a ticket, you will be required to log a progress comment on it ' +
  "before you can finish your turn — this is enforced, not just a suggestion."

new McpStdioServer({
  name: 'vide-todos',
  version: '1.0.0',
  tools: buildTodoTools(dataDir),
  instructions: TODO_WORKFLOW_INSTRUCTIONS,
  input: process.stdin,
  output: process.stdout,
}).start()
