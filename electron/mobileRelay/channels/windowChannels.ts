import { registerChannel } from '../dispatch'
import { BrowserWindow } from 'electron'
import { basename } from 'path'

// window:setTitle is a fire-and-forget notification that the mobile client
// informs the server about a project root change. While the mobile client
// is rendered in a browser (not an Electron window), we can accept and log
// this notification for tracking; it's handled as a send-style fire-and-forget.
// The actual relay server doesn't maintain a window title per-connection,
// so this is primarily for bookkeeping and future analytics.
export function registerWindowRelayChannels(): void {
  registerChannel('window:setTitle', (root: string) => {
    // Mobile relay connections don't have Electron windows, so we can't
    // actually set window titles. This channel is accepted for API compatibility
    // but is effectively a no-op for the relay (the desktop renderer wouldn't
    // see this anyway since it's from a mobile connection).
  })
}
