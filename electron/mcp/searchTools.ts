import type { McpToolDef } from './protocol'
import { webSearch, formatSearchResults } from '../webSearch'

export function buildSearchTools(): McpToolDef[] {
  return [
    {
      name: 'web_search',
      description:
        'Search the web and get back a ranked list of results (title, URL, snippet). Use this to look up ' +
        'documentation, error messages, library APIs, or any current information. To read a full result ' +
        "page afterward, navigate to its URL with vide-browser's browser_navigate + browser_read_page_text.",
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
          maxResults: { type: 'number', description: 'How many results to return (default 8, max 15)' },
        },
        required: ['query'],
      },
      handler: async (args) => {
        const query = String(args.query)
        const results = await webSearch(query, args.maxResults as number | undefined)
        return formatSearchResults(results, query)
      },
    },
  ]
}
