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
import { registerRecentProjectsRelayChannels } from './channels/recentProjectsChannels'
import { registerWindowRelayChannels } from './channels/windowChannels'
import { registerUsageRelayChannels } from './channels/usageChannels'
import { registerBridgeRelayChannels } from './channels/bridgeChannels'
import { registerTodosRelayChannels } from './channels/todosChannels'
import { registerNotesRelayChannels } from './channels/notesChannels'
import { registerAutocompleteRelayChannels } from './channels/autocompleteChannels'
import { registerInlineEditRelayChannels } from './channels/inlineEditChannels'
import { registerSessionRelayChannels } from './channels/sessionChannels'
import type { PtyManager } from '../pty'
import type { ClaudeManager } from '../claude'
import type { UsageManager } from '../usageManager'
import type { BridgeManager } from '../bridge'
import type { AutocompleteManager } from '../autocomplete'
import type { InlineEditManager } from '../inlineEdit'
import type { CommitMessageManager } from '../commitMessage'

export interface RelayChannelDeps {
  ptyManager: PtyManager
  claudeManager: ClaudeManager
  win: BrowserWindow
  usageManager: UsageManager
  bridgeManager: BridgeManager
  autocompleteManager: AutocompleteManager
  inlineEditManager: InlineEditManager
  commitMessageManager: CommitMessageManager
}

// Single entry point for wiring every domain's relay channels into the
// dispatch core. Each domain's registerXRelayChannels() call is wired here
// rather than scattering calls across MobileServer. Channels requiring
// per-window state or manager instances receive them via deps (PtyManager,
// ClaudeManager, UsageManager, BridgeManager, BrowserWindow), ensuring mobile
// sessions land in the same shared state those managers keep for desktop windows.
export function registerAllRelayChannels(deps: RelayChannelDeps): void {
  registerGitRelayChannels()
  registerFsRelayChannels()
  registerTermRelayChannels(deps.ptyManager, deps.win)
  registerClaudeRelayChannels(deps.claudeManager, deps.win)
  registerSystemRelayChannels()
  registerDockerRelayChannels()
  registerChangelogRelayChannels()
  registerOnboardingRelayChannels()
  registerCommitMessageRelayChannels(deps.commitMessageManager, deps.win)
  registerRecentProjectsRelayChannels()
  registerWindowRelayChannels()
  registerUsageRelayChannels(deps.usageManager)
  registerBridgeRelayChannels(deps.bridgeManager, deps.win)
  registerTodosRelayChannels()
  registerNotesRelayChannels()
  registerAutocompleteRelayChannels(deps.autocompleteManager, deps.win)
  registerInlineEditRelayChannels(deps.inlineEditManager, deps.win)
  registerSessionRelayChannels()
}
