import type { BrowserWindow } from 'electron'
import { registerChannel } from '../dispatch'
import type { CommitMessageManager } from '../../commitMessage'

// CommitMessage channel, mirroring the ipcMain wiring in
// electron/commitMessage.ts's CommitMessageManager.registerHandlers() — same
// channel name, same argument order, same delegation to
// CommitMessageManager's public generate(windowId, diff, model,
// customPrompt) method. The manager instance is the same one
// electron/main.ts constructs and disposes for the real desktop window
// (threaded through RelayChannelDeps), not a private instance owned by this
// file.
export function registerCommitMessageRelayChannels(commitMessageManager: CommitMessageManager, win: BrowserWindow): void {
  registerChannel('commitMessage:generate', (diff: string, model: string, customPrompt: string) =>
    commitMessageManager.generate(win.id, diff, model, customPrompt))
}
