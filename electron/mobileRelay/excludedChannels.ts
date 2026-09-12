// Channels intentionally never relayed to mobile clients, with reasons.
// A channel only belongs here if it's inherently tied to this specific
// desktop OS window (a native menu, a native file dialog) — anything that
// could plausibly work from a phone belongs in a channels/*.ts file instead.
export const EXCLUDED_CHANNELS = new Set<string>([
  // Streaming/PTY channels requiring per-connection state management
  'git:runCommand', 'git:log:resize',
  // Task 5 broadcaster already pushes git:changed/fs:changed to all connected clients regardless
  // of watched root; no per-connection registration point to wire this channel against
  'git:watchRoot', 'fs:watchRoot',
  // Docker event streaming — new streaming wiring comparable to term:data, deferred
  'docker:runLogs', 'docker:stopLogs', 'docker:watch', 'docker:unwatch',

  // Desktop-only native features
  'devtools:attach', 'devtools:detach',    // native developer tools
  'browserView:create', 'browserView:setBounds', 'browserView:setVisible', 'browserView:navigate',
  'browserView:goBack', 'browserView:goForward', 'browserView:reload', 'browserView:zoomIn',
  'browserView:zoomOut', 'browserView:zoomReset', 'browserView:setMobileMode', 'browserView:clearCache',
  'browserView:clearCookies', 'browserView:destroy',  // native Electron BrowserView instances — composite ON THE MAC'S SCREEN, not visible to phone user
  'dialog:openFolder',  // native macOS/Linux folder picker — no phone equivalent
  'menu:openProject', 'menu:closeActiveTab', 'menu:zoomIn', 'menu:zoomOut',
  'menu:resetZoom', 'menu:openSettings', 'menu:newFile', 'menu:newFolder',
  'menu:newTerminal', 'menu:reopenClosedTab', 'menu:save',  // native Electron Menu events
  'window:getInitialProject', 'window:openInNewWindow', 'window:focusProjectIfOpen',  // desktop window management

  'mobile:start', 'mobile:stop', 'mobile:getState', 'mobile:addDevice', 'mobile:selectInterface',
  'mobile:disconnectDevice', 'mobile:disconnectAll', 'mobile:setDisplay', 'mobile:setDefaultMode',
  // Mobile server control — a mobile client doesn't control its own pairing server

  // MCP (Model Context Protocol) toggle channels — desktop-config-only (NOT the underlying todos/notes data, which are implemented below)
  'browser:mcp:enable', 'browser:mcp:disable',
  'todos:mcp:enable', 'todos:mcp:disable',
  'notes:mcp:enable', 'notes:mcp:disable',

  // App-level operations
  'update:restart',  // quits the desktop app

  // Language server management — ambiguous whether these should work from mobile; deferred
  'lsp:install', 'lsp:setEnabled', 'lsp:detectAll', 'lsp:getDefinition',

  // Peripheral features — long-running processes, lower priority
  'graphify:isAvailable', 'graphify:run', 'graphify:readGraph', 'graphify:installClaudeSkill',
  'update:getLatest',  // minor feature
])
