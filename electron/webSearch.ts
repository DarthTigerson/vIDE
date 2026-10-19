import { request } from 'https'

// Web search for vIDE's embedded assistants, backed by DuckDuckGo's HTML
// endpoint (https://html.duckduckgo.com/html/). No API key, no account, no
// JS runtime — a plain HTTPS POST returning server-rendered result markup we
// parse here. Deliberately depends on nothing Electron-specific so it can be
// imported both by the main process (Bridge) and by the standalone
// ELECTRON_RUN_AS_NODE MCP server process (vide-search).
//
// The parser is split out and exported as a pure function so a DDG markup
// change is a one-function fix backed by a failing unit test, not a hunt —
// same pure-logic/IO split as electron/gitArgs.ts vs gitRunner.ts.

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

const DEFAULT_MAX_RESULTS = 8
const MAX_RESULTS_CAP = 15

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#39;': "'",
  '&#x2F;': '/',
  '&nbsp;': ' ',
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;|&lt;|&gt;|&quot;|&#x27;|&#39;|&#x2F;|&nbsp;/g, (m) => HTML_ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
}

// DDG result links are wrapped in a redirector:
//   //duckduckgo.com/l/?uddg=<percent-encoded real url>&rut=...
// Pull the real URL back out; pass through anything already absolute.
function unwrapRedirect(href: string): string {
  const uddg = /[?&]uddg=([^&]+)/.exec(href)
  if (uddg) {
    try {
      return decodeURIComponent(uddg[1])
    } catch {
      // fall through to the raw href
    }
  }
  if (href.startsWith('//')) return `https:${href}`
  return href
}

// Pure: turns a DDG HTML results page into structured results. Exported for
// unit testing. Tolerant by design — a block missing a snippet yields an
// empty snippet rather than dropping the result, and unexpected markup just
// produces fewer results (never a throw).
export function parseDuckDuckGoHtml(html: string): SearchResult[] {
  const results: SearchResult[] = []

  // Each organic result is a `.result` block; splitting on the result anchor
  // keeps title+url+snippet from the same block together.
  const anchorRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
  const snippetRe = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g

  const snippets: string[] = []
  let sm: RegExpExecArray | null
  while ((sm = snippetRe.exec(html)) !== null) {
    snippets.push(stripTags(sm[1]))
  }

  let am: RegExpExecArray | null
  let i = 0
  while ((am = anchorRe.exec(html)) !== null) {
    const url = unwrapRedirect(am[1])
    const title = stripTags(am[2])
    if (!url || !title) {
      i++
      continue
    }
    results.push({ title, url, snippet: snippets[i] ?? '' })
    i++
  }

  return results
}

function fetchDuckDuckGo(query: string): Promise<string> {
  const body = new URLSearchParams({ q: query }).toString()
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: 'html.duckduckgo.com',
        path: '/html/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          // A normal browser UA — DDG serves a bot/consent page to obviously
          // scripted clients.
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      }
    )
    req.on('error', reject)
    req.setTimeout(15_000, () => req.destroy(new Error('Search request timed out after 15s')))
    req.end(body)
  })
}

// Runs a web search and returns the top results. Throws a clear Error on
// network failure or when the response can't be parsed into results (as
// opposed to a valid empty result set, which returns []).
export async function webSearch(query: string, maxResults = DEFAULT_MAX_RESULTS): Promise<SearchResult[]> {
  const trimmed = (query ?? '').trim()
  if (!trimmed) throw new Error('Search query is empty.')

  const cap = Math.max(1, Math.min(MAX_RESULTS_CAP, Math.floor(maxResults) || DEFAULT_MAX_RESULTS))

  let html: string
  try {
    html = await fetchDuckDuckGo(trimmed)
  } catch (err) {
    throw new Error(`Web search request failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // A real results page always contains result anchors; their total absence
  // means DDG returned a consent/captcha/error page, which is a failure to
  // surface rather than a legitimate "no results".
  if (!/class="[^"]*result__a/.test(html)) {
    throw new Error(
      'Web search returned an unparseable response (DuckDuckGo may be rate-limiting or served a consent page).'
    )
  }

  return parseDuckDuckGoHtml(html).slice(0, cap)
}

// Shared text renderer so Claude (MCP) and Bridge see identical output.
export function formatSearchResults(results: SearchResult[], query: string): string {
  if (results.length === 0) return `No web results found for "${query}".`
  const lines = results.map((r, i) => {
    const snippet = r.snippet ? `\n   ${r.snippet}` : ''
    return `${i + 1}. ${r.title}\n   ${r.url}${snippet}`
  })
  return `Web results for "${query}":\n\n${lines.join('\n\n')}`
}
