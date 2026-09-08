# Browser MCP Improvements

## New tools to add

### Requested
- [x] `browser_evaluate` — run arbitrary JS in the page (console execute)
- [x] `browser_get_network_log` — capture network requests (XHR, fetch, etc.)
- [x] `browser_get_html` — get full page HTML source (for finding selectors)

### Phase 3 — CDP power tools
- [x] `browser_get_response_body` — raw response body from any captured network request
- [x] `browser_save_pdf` — export current page as PDF to disk
- [x] `browser_get_accessibility_tree` — semantic page outline (roles, names, values)
- [x] `browser_check_certificate` — TLS cert expiry, issuer, fingerprint
- [x] `browser_set_extra_headers` — inject auth tokens / API keys into all Claude tab requests

### Gap-fill (from scraper diagnosis)
- [x] `browser_wait_for_load` — wait until page stops loading (with timeout)
- [x] `browser_wait_for_selector` — poll until a CSS selector appears in the DOM
- [x] `browser_find_element` — find by selector or text, returns centre coords for browser_click
- [x] `browser_scroll` — scroll page by pixels or to element
- [x] `browser_key_press` — press specific keys (Enter, Tab, Escape, arrows)
- [x] `browser_get_url` — get the current URL (useful after redirects)
- [x] `browser_save_html` — save full page HTML to disk, return path
