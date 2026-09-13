import { BrowserWindow } from 'electron'
import { registerChannel } from '../dispatch'
import type { ClaudeManager } from '../../claude'

// Claude session channels, mirroring the ipcMain wiring in
// electron/claude.ts's ClaudeManager.registerHandlers() — same channel
// names, same argument order, same delegation to ClaudeManager's public
// spawn/write/resize/kill methods. As with termChannels, every
// mobile-originated Claude session is bound to the single paired window
// supplied by MobileServer rather than resolved per-call from
// event.sender — ClaudeManager already keys its state by win.id
// internally, so this is just another entry in that same per-window map,
// using a fresh instance id. `mode` is typed `as never` here since
// SessionMode isn't exported from claude.ts; ClaudeManager.spawn still
// validates/narrows it the same way it does for the real window.
export function registerClaudeRelayChannels(claudeManager: ClaudeManager, win: BrowserWindow): void {
  registerChannel('claude:spawn', (cwd: string, instanceId: string, mode?: string) =>
    claudeManager.spawn(win, cwd, instanceId, mode as never))
  registerChannel('claude:write', (instanceId: string, data: string) => claudeManager.write(win, instanceId, data))
  registerChannel('claude:resize', (instanceId: string, cols: number, rows: number) =>
    claudeManager.resize(win, instanceId, cols, rows))
  registerChannel('claude:kill', (instanceId: string) => claudeManager.kill(win, instanceId))
}
