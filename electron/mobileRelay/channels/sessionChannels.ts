import { registerChannel } from '../dispatch'
import { loadSession, saveSession } from '../../session'
import type { SessionData } from '../../session'

// Session channels, mirroring the ipcMain wiring in electron/session.ts's
// registerSessionHandlers() — same channel names, same argument order, same
// delegation to session.ts's exported loadSession/saveSession functions.
// The only data these actually carry today is the stacked Claude
// instances (count + hue) for a project (see SessionData.claudeInstances) —
// keyed on disk by a hash of the project's path, not by any particular
// BrowserWindow — so restoring it for a mobile-originated project has no
// conflict with this plan's "independent second window, no workspace-state
// sync" non-goal (that non-goal is about NOT mirroring live editor/tab/pane
// layout between desktop and mobile, which this doesn't do).
export function registerSessionRelayChannels(): void {
  registerChannel('session:load', (projectRoot: string) => loadSession(projectRoot))
  registerChannel('session:save', (projectRoot: string, data: SessionData) => saveSession(projectRoot, data))
}
