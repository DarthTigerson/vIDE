import { BrowserWindow } from 'electron'
import { registerChannel } from '../dispatch'
import type { PtyManager } from '../../pty'

// Terminal channels, mirroring the ipcMain wiring in electron/pty.ts's
// PtyManager.registerHandlers() — same channel names, same argument order,
// same delegation to PtyManager's public spawn/kill/write/resize methods.
// Unlike the real desktop window (resolved per-call from event.sender), a
// mobile connection has no BrowserWindow of its own — every mobile-spawned
// terminal is bound to the single paired window supplied by MobileServer,
// consistent with the "independent second window" model (spec): PtyManager
// already keys its state by win.id internally, so this is just another
// entry in that same per-window map, using a fresh terminal id.
export function registerTermRelayChannels(ptyManager: PtyManager, win: BrowserWindow): void {
  registerChannel('term:spawn', (id: string, cwd?: string) => ptyManager.spawn(win, id, cwd))
  registerChannel('term:kill', (id: string) => ptyManager.kill(win, id))
  registerChannel('term:write', (id: string, data: string) => ptyManager.write(win, id, data))
  registerChannel('term:resize', (id: string, cols: number, rows: number) => ptyManager.resize(win, id, cols, rows))
}
