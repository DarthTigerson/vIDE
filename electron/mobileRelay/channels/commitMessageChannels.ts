import { registerChannel } from '../dispatch'
import { buildCommitMessagePrompt, postProcessCommitMessage } from '../../commitMessage'

// commitMessage:generate is handled separately via the Claude relay channels
// since it requires real-time Claude streaming and is window-specific.
// The helper functions for building/post-processing prompts are exported below
// but not directly exposed as channels; they're internal helpers for the
// commitMessage:generate handler which integrates with claudeChannels.
export function registerCommitMessageRelayChannels(): void {
  // Commit message generation is handled via Claude streaming channels
  // No direct channels to register here for now
}
