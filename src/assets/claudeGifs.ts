import clawdDancing from './clawdDancing.gif'
import claudeArtist from './claude-artist.gif'
import claudeFu from './claude-fu.gif'
import claudeIdea from './claude-idea.gif'
import claudeJam from './claude-jam.gif'
import claudeMagic from './claude-magic.gif'
import claudePolish from './claude-polish.gif'

// Shared by the two "Claude is working" indicators — the Git commit-message
// generate button (GitPanel) and the activity bar icon (ClaudeStatusIcon).
export const CLAUDE_WORKING_GIFS = [
  clawdDancing,
  claudeArtist,
  claudeFu,
  claudeIdea,
  claudeJam,
  claudeMagic,
  claudePolish,
]

export function pickClaudeGif(): string {
  return CLAUDE_WORKING_GIFS[Math.floor(Math.random() * CLAUDE_WORKING_GIFS.length)]
}
