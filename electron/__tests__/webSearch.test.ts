import { describe, it, expect } from 'vitest'
import { parseDuckDuckGoHtml, formatSearchResults, type SearchResult } from '../webSearch'

// A trimmed-down but structurally faithful sample of the markup DDG's
// html.duckduckgo.com/html/ endpoint returns: redirect-wrapped result links,
// HTML entities, and <b> tags inside titles/snippets.
const SAMPLE_HTML = `
<div class="serp__results">
  <div class="result results_links results_links_deep web-result">
    <div class="links_main">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Ffoo%3Fa%3D1%26b%3D2&amp;rut=abc">Example <b>Foo</b> Page</a>
      </h2>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com">First result snippet with &amp; an entity &#39;here&#39;.</a>
    </div>
  </div>
  <div class="result results_links results_links_deep web-result">
    <div class="links_main">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fbar&amp;rut=def">Bar &amp; Baz</a>
      </h2>
      <a class="result__snippet" href="#">Second <b>snippet</b> text.</a>
    </div>
  </div>
</div>
`

describe('parseDuckDuckGoHtml', () => {
  it('extracts title, un-wrapped url, and snippet for each result', () => {
    const results = parseDuckDuckGoHtml(SAMPLE_HTML)
    expect(results).toHaveLength(2)

    expect(results[0]).toEqual<SearchResult>({
      title: 'Example Foo Page',
      url: 'https://example.com/foo?a=1&b=2',
      snippet: "First result snippet with & an entity 'here'.",
    })

    expect(results[1]).toEqual<SearchResult>({
      title: 'Bar & Baz',
      url: 'https://example.org/bar',
      snippet: 'Second snippet text.',
    })
  })

  it('returns an empty array for markup with no results', () => {
    expect(parseDuckDuckGoHtml('<html><body>nothing here</body></html>')).toEqual([])
  })

  it('keeps a result whose snippet is missing, with an empty snippet', () => {
    const html = `
      <h2 class="result__title">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fno-snippet.test">No Snippet</a>
      </h2>`
    expect(parseDuckDuckGoHtml(html)).toEqual<SearchResult[]>([
      { title: 'No Snippet', url: 'https://no-snippet.test', snippet: '' },
    ])
  })

  it('passes through an already-absolute href', () => {
    const html = `<a class="result__a" href="https://direct.test/page">Direct</a>`
    expect(parseDuckDuckGoHtml(html)[0].url).toBe('https://direct.test/page')
  })
})

describe('formatSearchResults', () => {
  it('renders a numbered list with url and snippet', () => {
    const out = formatSearchResults(
      [{ title: 'T', url: 'https://u.test', snippet: 'S' }],
      'query'
    )
    expect(out).toContain('Web results for "query"')
    expect(out).toContain('1. T')
    expect(out).toContain('https://u.test')
    expect(out).toContain('S')
  })

  it('omits the snippet line when there is no snippet', () => {
    const out = formatSearchResults([{ title: 'T', url: 'https://u.test', snippet: '' }], 'q')
    expect(out).toBe('Web results for "q":\n\n1. T\n   https://u.test')
  })

  it('reports no results distinctly', () => {
    expect(formatSearchResults([], 'nothing')).toBe('No web results found for "nothing".')
  })
})
