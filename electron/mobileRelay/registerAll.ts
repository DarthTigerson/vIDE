import type { BrowserWindow } from 'electron'
import { registerGitRelayChannels } from './channels/gitChannels'
import { registerFsRelayChannels } from './channels/fsChannels'
import { registerTermRelayChannels } from './channels/termChannels'
import { registerClaudeRelayChannels } from './channels/claudeChannels'
import { registerSystemRelayChannels } from './channels/systemChannels'
import { registerDockerRelayChannels } from './channels/dockerChannels'
import { registerChangelogRelayChannels } from './channels/changelogChannels'
import { registerOnboardingRelayChannels } from './channels/onboardingChannels'
import { registerCommitMessageRelayChannels } from './channels/commitMessageChannels'
import type { PtyManager } from '../pty'
import type { ClaudeManager } from '../claude'

export interface RelayChannelDeps {
  ptyManager: PtyManager
  claudeManager: ClaudeManager
  win: BrowserWindow
}

// Single entry point for wiring every domain's relay channels into the
// dispatch core — later tasks (Bridge, etc.) each add their own
// registerXRelayChannels() call here rather than scattering calls across
// MobileServer. Terminal/Claude channels need the paired window and the
// app's real PtyManager/ClaudeManager instances (so mobile sessions land
// in the same per-window state those managers already keep for real
// desktop windows), supplied by the caller (MobileServer).
export function registerAllRelayChannels(deps: RelayChannelDeps): void {
  registerGitRelayChannels()
  registerFsRelayChannels()
  registerTermRelayChannels(deps.ptyManager, deps.win)
  registerClaudeRelayChannels(deps.claudeManager, deps.win)
  registerSystemRelayChannels()
  registerDockerRelayChannels()
  registerChangelogRelayChannels()
  registerOnboardingRelayChannels()
  registerCommitMessageRelayChannels()
}
