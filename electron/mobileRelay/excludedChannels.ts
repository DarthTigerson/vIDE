// Channels intentionally never relayed to mobile clients, with reasons.
// A channel only belongs here if it's inherently tied to this specific
// desktop OS window (a native menu, a native file dialog) — anything that
// could plausibly work from a phone belongs in a channels/*.ts file instead.
export const EXCLUDED_CHANNELS = new Set<string>([
  // Native file/menu dialogs
  'dialog:openFolder',       // native macOS/Linux folder picker — no phone equivalent
  'menu:openProject', 'menu:closeActiveTab', 'menu:zoomIn', 'menu:zoomOut',
  'menu:resetZoom', 'menu:openSettings', 'menu:newFile', 'menu:newFolder',
  'menu:newTerminal', 'menu:reopenClosedTab', 'menu:save',
  // Native Electron Menu events — the phone has no OS-level app menu to bind to
  'window:getInitialProject', 'window:openInNewWindow', 'window:focusProjectIfOpen',
  // Desktop window management — not applicable to mobile sessions

  // Streaming/PTY channels requiring per-window state
  'git:runCommand', 'git:log:resize', 'git:watchRoot',
  'fs:watchRoot',
  'docker:runLogs', 'docker:stopLogs', 'docker:watch', 'docker:unwatch',

  // Desktop-only features
  'devtools:attach', 'devtools:detach',    // native developer tools
  'browserView:create', 'browserView:setBounds', 'browserView:setVisible', 'browserView:navigate',
  'browserView:goBack', 'browserView:goForward', 'browserView:reload', 'browserView:zoomIn',
  'browserView:zoomOut', 'browserView:zoomReset', 'browserView:setMobileMode', 'browserView:clearCache',
  'browserView:clearCookies', 'browserView:destroy',  // native Electron BrowserView instances
  'session:load', 'session:save',          // desktop Electron session persistence
  'inlineEdit:start', 'inlineEdit:cancel', // desktop editor inline edit features
  'mobile:start', 'mobile:stop', 'mobile:getState', 'mobile:addDevice', 'mobile:selectInterface',
  'mobile:disconnectDevice', 'mobile:disconnectAll', 'mobile:setDisplay', 'mobile:setDefaultMode',
  // Mobile server control — a mobile client is already connected and doesn't control the server

  // MCP (Model Context Protocol) controls — architecture-specific
  'browser:mcp:enable', 'browser:mcp:disable',
  'todos:mcp:enable', 'todos:mcp:disable',
  'notes:mcp:enable', 'notes:mcp:disable',

  // App-level and process-management operations
  'update:restart',  // quits the desktop app, not applicable to browser client
  'commitMessage:generate',  // per-window Claude process spawning
  'autocomplete:complete', 'lsp:install', 'lsp:setEnabled', 'lsp:detectAll', 'lsp:getDefinition',  // language server processes

  // Advanced features requiring desktop state/processes
  'usage:acquire', 'usage:release', 'usage:getLatest', 'usage:getRange', 'usage:getPassiveEnabled', 'usage:setPassiveEnabled',
  'update:getLatest',  // update checking tied to app.getVersion() and desktop state
  'bridge:send', 'bridge:approve', 'bridge:reject', 'bridge:cancel', 'bridge:testConnection', 'bridge:getSettings', 'bridge:setSettings',  // LLM bridge connections
  'todos:listProjects', 'todos:createProject', 'todos:renameProject', 'todos:deleteProject', 'todos:listTodos',
  'todos:createTodo', 'todos:updateTodo', 'todos:reorderTodo', 'todos:archiveTodo', 'todos:archiveTodos',
  'todos:deleteTodo', 'todos:addComment', 'todos:saveAttachment', 'todos:readAttachmentDataUrl',  // todos/notes MCP features
  'notes:getRoot', 'notes:createNote', 'notes:createFolder', 'notes:renameEntry', 'notes:search',
  'graphify:isAvailable', 'graphify:run', 'graphify:readGraph', 'graphify:installClaudeSkill',  // knowledge graph features
])
