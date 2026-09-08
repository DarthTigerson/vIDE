# Browser MCP Improvements

## New tools to add

### Requested
- [x] `browser_evaluate` — run arbitrary JS in the page (console execute)
- [x] `browser_get_network_log` — capture network requests (XHR, fetch, etc.)
- [x] `browser_get_html` — get full page HTML source (for finding selectors)

### Gap-fill (from scraper diagnosis)
- [ ] `browser_wait_for_load` — wait until page stops loading (with timeout)
- [ ] `browser_scroll` — scroll page by pixels or to element
- [ ] `browser_key_press` — press specific keys (Enter, Tab, Escape, arrows)
- [ ] `browser_get_url` — get the current URL (useful after redirects)
