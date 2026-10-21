import { McpStdioServer } from './protocol'
import { buildDocsTools, DOCS_INSTRUCTIONS } from './docsTools'

// Self-contained like vide-search: reads files by absolute path, so it needs
// no data dir and no per-window socket.
new McpStdioServer({
  name: 'vide-docs',
  version: '1.0.0',
  instructions: DOCS_INSTRUCTIONS,
  tools: buildDocsTools(),
  input: process.stdin,
  output: process.stdout,
}).start()
