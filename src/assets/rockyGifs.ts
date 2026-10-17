import rockyAmaze from './rocky-amaze.gif'
import rockyDance from './rocky-dance.gif'
import rockyYay from './rocky-yay.gif'

// Rocky Code's "working" animations for its activity bar icon — the Rocky
// counterpart of CLAUDE_WORKING_GIFS (claudeGifs.ts).
export const ROCKY_WORKING_GIFS = [rockyAmaze, rockyDance, rockyYay]

export function pickRockyGif(): string {
  return ROCKY_WORKING_GIFS[Math.floor(Math.random() * ROCKY_WORKING_GIFS.length)]
}
