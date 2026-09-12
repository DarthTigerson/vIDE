import { registerChannel } from '../dispatch'
import { CommitMessageManager } from '../../commitMessage'
import type { BrowserWindow } from 'electron'

// CommitMessage:generate requires a CommitMessageManager instance for Claude process spawning.
// We create and maintain a single manager for the relay to handle mobile client requests.
let commitMessageManager: CommitMessageManager | null = null

function ensureManager(win: BrowserWindow): CommitMessageManager {
  if (!commitMessageManager) {
    commitMessageManager = new CommitMessageManager()
  }
  return commitMessageManager
}

export function registerCommitMessageRelayChannels(win: BrowserWindow): void {
  const manager = ensureManager(win)
  registerChannel('commitMessage:generate', (diff: string, model: string, customPrompt: string) =>
    manager.generate(0, diff, model, customPrompt))
}
