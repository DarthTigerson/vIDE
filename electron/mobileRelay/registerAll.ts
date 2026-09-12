import { registerGitRelayChannels } from './channels/gitChannels'
import { registerFsRelayChannels } from './channels/fsChannels'

// Single entry point for wiring every domain's relay channels into the
// dispatch core — later tasks (Bridge, Claude, terminal, etc.) each add
// their own registerXRelayChannels() call here rather than scattering calls
// across MobileServer.
export function registerAllRelayChannels(): void {
  registerGitRelayChannels()
  registerFsRelayChannels()
}
