import type { VcloakHost } from './types'

// Pure, so the settings page can use it without pulling in Node modules.

// Host of a pasted link or git remote, lowercased, or null for plain text
function hostOf(s: string): string | null {
  const t = s.trim()
  const scp = /^[\w.-]+@([\w.-]+):(?!\/\/)/.exec(t)
  if (scp) return scp[1].toLowerCase()
  if (!/^(?:https?|ssh):\/\//i.test(t)) return null
  try { return new URL(t).hostname.toLowerCase() } catch { return null }
}

// A pasted link tells which kind of host it is; plain names tell nothing
export function guessHost(input: string): VcloakHost | null {
  const host = hostOf(input)
  if (!host) return null
  if (host === 'github.com' || host.endsWith('.github.com')) return 'github'
  if (host.includes('gitlab')) return 'gitlab'
  return null
}
