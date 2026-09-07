// The first-ever Claude instance always keeps the normal brand orange — no
// visual change for anyone who never adds a second session. Each additional
// instance gets the next color here (cycling if exhausted), assigned once
// at creation time and carried with the instance, so closing one session
// never re-colors the others.
export const CLAUDE_INSTANCE_HUES = [
  '#D97757', // brand orange — always the first instance
  '#5B9BD5',
  '#9B7ED9',
  '#6FBF73',
  '#E37CA8',
  '#4FC3C0',
  '#E0A84D',
]

export function hueForInstanceIndex(index: number): string {
  return CLAUDE_INSTANCE_HUES[index % CLAUDE_INSTANCE_HUES.length]
}
