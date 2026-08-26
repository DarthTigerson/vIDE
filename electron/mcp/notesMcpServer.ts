import { McpStdioServer } from './protocol'
import { buildNotesTools } from './notesTools'

const dataDir = process.env.VIDE_NOTES_DATA_DIR
if (!dataDir) {
  process.stderr.write('VIDE_NOTES_DATA_DIR is not set\n')
  process.exit(1)
}

new McpStdioServer({
  name: 'vide-notes',
  version: '1.0.0',
  tools: buildNotesTools(dataDir),
  input: process.stdin,
  output: process.stdout,
}).start()
