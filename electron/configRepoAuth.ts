// Embeds the sync token as the URL's *password* under a fixed `oauth2`
// username. GitLab only authenticates a token sent as the password (the
// username is ignored but must be present); GitHub accepts any username with
// a token password. Putting the token in the username slot with no password
// makes git fetch the password from a credential helper or a terminal prompt
// instead of sending the token — which only "worked" on GitHub when the macOS
// Keychain happened to hold a github.com login (VIDE sync GitLab bug).
export function buildAuthUrl(repoUrl: string, token: string): string {
  // new URL() throws on malformed input — the caller receives a proper error
  // rather than the raw string being interpolated into a command.
  const url = new URL(repoUrl)
  url.username = 'oauth2'
  url.password = token
  return url.toString()
}

// Git options for every config-sync command: never prompt (there's no TTY, so
// a prompt either fails obscurely or hangs until the timeout), and ignore any
// system/user credential helper so a stale Keychain entry can't mask a missing
// or wrong token — the token in the remote URL is the only credential used.
export const SYNC_GIT_CONFIG_ARGS = ['-c', 'credential.helper=']
export const SYNC_GIT_ENV = { GIT_TERMINAL_PROMPT: '0' }
