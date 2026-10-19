import { McpStdioServer } from './protocol'
import { buildSearchTools } from './searchTools'

// Unlike vide-browser (per-window socket) and vide-todos/vide-notes (a data
// dir fixed at registration), web search is fully self-contained: it just
// makes an outbound HTTPS request and parses the result. So this server needs
// no env wiring at all — no VIDE_WINDOW_ID, no data dir — and works from any
// Claude session regardless of whether a vIDE window is open.
new McpStdioServer({
  name: 'vide-search',
  version: '1.0.0',
  instructions:
    'Use web_search to look things up online — docs, error messages, library APIs, current information. ' +
    'It returns a ranked list of {title, URL, snippet}; fetch a result page with browser_navigate if you ' +
    'need its full contents.',
  tools: buildSearchTools(),
  input: process.stdin,
  output: process.stdout,
}).start()
