import { app } from 'electron'
import { join } from 'path'

// Unpackaged runs (`npm run dev`, running the built app from out/) get their
// own profile so testing a branch never touches the installed vIDE's data
// (VIDE-24). Without this, dev shared ~/Library/Application Support/vIDE
// (settings, todos, notes, sessions, browser cookies) with the real app, and
// re-registered the user-scope Claude Code MCP servers/plugin to point at the
// dev binary and dev data dir, rewiring the real app's Claude sessions too.
//
// VIDE_DEV_SHARED_PROFILE=1 restores the old behavior (share the real
// profile and allow the global registrations), e.g. to debug real data.
export const DEV_PROFILE_DIR_NAME = 'vIDE-dev'

export function isIsolatedDevProfile(
  isPackaged: boolean = app.isPackaged,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return !isPackaged && env.VIDE_DEV_SHARED_PROFILE !== '1'
}

// Must run before app 'ready' and before anything reads userData, since
// Chromium fixes its own storage location (localStorage, cookies) at ready.
export function applyDevProfile(): void {
  if (!isIsolatedDevProfile()) return
  const dir = join(app.getPath('appData'), DEV_PROFILE_DIR_NAME)
  app.setPath('userData', dir)
  console.log(`[dev-profile] Using isolated userData at ${dir} (set VIDE_DEV_SHARED_PROFILE=1 to share the real profile)`)
}
