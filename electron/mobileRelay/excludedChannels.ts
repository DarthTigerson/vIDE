// Channels intentionally never relayed to mobile clients, with reasons.
// A channel only belongs here if it's inherently tied to this specific
// desktop OS window (a native menu, a native file dialog) — anything that
// could plausibly work from a phone belongs in a channels/*.ts file instead.
export const EXCLUDED_CHANNELS = new Set<string>([
  'dialog:openFolder',       // native macOS/Linux folder picker — no phone equivalent
  'menu:openProject', 'menu:closeActiveTab', 'menu:zoomIn', 'menu:zoomOut',
  'menu:resetZoom', 'menu:openSettings', 'menu:newFile', 'menu:newFolder',
  'menu:newTerminal', 'menu:reopenClosedTab', 'menu:save',
  // native Electron Menu events — the phone has no OS-level app menu to bind to
  'window:getInitialProject', // desktop window-restore concept, not meaningful for a fresh mobile session
])
