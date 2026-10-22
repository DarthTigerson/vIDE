import { ipcMain, BrowserWindow } from 'electron'
import { spawn, execFile } from 'child_process'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { WebContents } from 'electron'
import type { GraphifyInstaller } from './graphifyInstall'
import type { GraphifyGraph } from '../src/types/graphify'
import { findBrokenGraphifyHookPaths } from './graphifyHooks'
import { graphifyOutNeedsGitignore, addGraphifyOutToGitignore } from './graphifyGitignore'

const NOT_INSTALLED_MESSAGE =
  "Error: 'graphify' not found in PATH.\r\nInstall it from Settings > Graphify.\r\n"

// Electron-launched apps (Finder/Dock, not `npm run dev` from a terminal)
// don't inherit the interactive shell's PATH, so a bare spawn('graphify', ...)
// fails whenever the CLI lives outside the default system PATH (e.g.
// installed via `uv tool install graphifyy`, which places binaries in
// ~/.local/bin). Mirrors resolveClaudePath() in electron/autocomplete.ts:
// resolve the absolute path once via a login shell and cache it. Falls back
// to the bare command name (not null) on failure so downstream spawn() calls
// still produce a sensible ENOENT/"not installed" error rather than silently
// no-op'ing.
let cachedGraphifyPath: string | null | undefined
// Caches the in-flight resolution promise so concurrent callers (e.g. the
// registerHandlers() prewarm below racing an early checkAvailable() call)
// share a single login-shell resolution instead of spawning their own.
let pendingGraphifyPathResolution: Promise<string | null> | undefined

export function resolveGraphifyPath(): Promise<string | null> {
  if (cachedGraphifyPath !== undefined) return Promise.resolve(cachedGraphifyPath)
  if (pendingGraphifyPathResolution) return pendingGraphifyPathResolution

  pendingGraphifyPathResolution = new Promise<string | null>((resolve) => {
    const shell = process.env.SHELL ?? '/bin/zsh'
    execFile(shell, ['-lic', 'command -v graphify'], (err, stdout) => {
      // `-lic` runs an interactive login shell, which sources .zshrc/.zprofile
      // and can prepend banners or version-manager output (nvm, pyenv, ...) to
      // stdout. Take the last non-empty line rather than the whole trimmed
      // output, and require it to look like an absolute path.
      const lines = (stdout ? stdout.toString() : '').split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
      const lastLine = lines[lines.length - 1]
      const resolved = !err && lastLine && lastLine.startsWith('/') ? lastLine : null

      if (resolved) {
        // Only cache successes — caching a failure would silently disable the
        // absolute-path resolution for the rest of the app session on a
        // transient hiccup (shell not ready yet, PATH not sourced yet, etc.).
        cachedGraphifyPath = resolved
        resolve(resolved)
        return
      }

      // uv puts tools in ~/.local/bin, which a login shell may not have on
      // PATH (and won't, right after vIDE's own install button ran uv).
      const uvTool = join(homedir(), '.local', 'bin', 'graphify')
      if (existsSync(uvTool)) {
        cachedGraphifyPath = uvTool
        resolve(uvTool)
        return
      }

      console.error('[graphify] failed to resolve graphify CLI path via login shell:', err ?? `unexpected output: ${JSON.stringify(stdout)}`)
      resolve(null)
    })
  })

  pendingGraphifyPathResolution.finally(() => {
    pendingGraphifyPathResolution = undefined
  })

  return pendingGraphifyPathResolution
}

// Where an install just put graphify, so later spawns find it at once.
function rememberGraphifyPath(path: string): void {
  cachedGraphifyPath = path
}

export function _resetGraphifyPathCacheForTesting(): void {
  cachedGraphifyPath = undefined
  pendingGraphifyPathResolution = undefined
}

// Stages exactly the artifacts `graphify install --platform claude --project`
// itself documents that it writes — not the whole .claude/ directory, which
// also holds machine-local files (settings.json's hook-guard config embeds
// an absolute path specific to this machine, settings.local.json,
// scheduled_tasks.lock) that shouldn't be silently staged for a team-shared
// commit. Best-effort: a failure here (cwd isn't a git repo, git isn't on
// PATH, ...) shouldn't turn a successful skill install into a reported
// failure, so errors are swallowed rather than surfaced to the caller.
function stageInstalledSkillFiles(cwd: string): Promise<void> {
  const candidates = ['.claude/skills/graphify', '.claude/CLAUDE.md'].filter((p) => existsSync(join(cwd, p)))
  if (candidates.length === 0) return Promise.resolve()
  return new Promise((resolve) => {
    execFile('git', ['add', ...candidates], { cwd }, () => resolve())
  })
}

export interface GraphifyInstallInfo {
  path: string | null
  source: 'system' | null
  // graphify's own size isn't known ahead (uv fetches Python and the package).
  downloadBytes: number | null
}

function runClaudeSkillInstall(cwd: string): Promise<{ ok: boolean; output: string }> {
  return resolveGraphifyPath().then((resolved) => new Promise((resolve) => {
    execFile(resolved ?? 'graphify', ['install', '--platform', 'claude', '--project'], { cwd }, (err, stdout, stderr) => {
      const output = [stdout, stderr].filter((s) => s && s.trim().length > 0).join('\n').trim()
      resolve(err ? { ok: false, output: output || err.message } : { ok: true, output })
    })
  }))
}

export class GraphifyManager {
  private runningByWindow = new Map<number, boolean>()
  private installing: Promise<{ ok: true; path: string } | { ok: false; error: string }> | null = null

  constructor(private installer: GraphifyInstaller | null = null) {}

  private async getInstall(): Promise<GraphifyInstallInfo> {
    const path = await resolveGraphifyPath()
    return { path, source: path ? 'system' : null, downloadBytes: null }
  }

  // Settings › Graphify's install button: uv (the user's, or vIDE's pinned
  // copy, downloaded with progress) runs `uv tool install graphifyy`. One
  // install at a time however many windows ask.
  private install(sender: WebContents): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
    if (this.installing) return this.installing
    const installer = this.installer
    if (!installer) return Promise.resolve({ ok: false, error: 'Installing graphify is not available here' })
    const run = async (): Promise<{ ok: true; path: string } | { ok: false; error: string }> => {
      const uv = (await installer.findUv()) ?? await installer.downloadUv({
        onProgress: (received, total) => { if (!sender.isDestroyed()) sender.send('graphify:installProgress', received, total) },
      })
      const result = await installer.installGraphify(uv)
      if (!result.ok) return { ok: false, error: result.output.trim() || 'uv could not install graphify' }
      const binDir = (await installer.toolBinDir(uv)) ?? join(homedir(), '.local', 'bin')
      const path = join(binDir, 'graphify')
      rememberGraphifyPath(path)
      return { ok: true, path }
    }
    const running = run()
      .catch((err: unknown) => ({ ok: false as const, error: err instanceof Error ? err.message : String(err) }))
      .finally(() => { this.installing = null })
    this.installing = running
    return running
  }

  registerHandlers(): void {
    // Prewarm the login-shell resolution at startup so it's usually already
    // cached by the time the user clicks "Build graph".
    resolveGraphifyPath()

    ipcMain.handle('graphify:isAvailable', () => this.checkAvailable())
    ipcMain.handle('graphify:getInstall', () => this.getInstall())
    ipcMain.handle('graphify:install', (event) => this.install(event.sender))

    ipcMain.handle('graphify:run', async (event, id: string, cwd: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return

      if (this.runningByWindow.get(win.id)) {
        if (!win.isDestroyed()) {
          win.webContents.send('graphify:data', id, 'A graphify run is already running.\n')
          win.webContents.send('graphify:exit', id, 1)
        }
        return
      }

      // spawn() also emits ENOENT when `cwd` doesn't exist (not just when the
      // binary is missing), which would otherwise misreport a deleted/renamed
      // project folder as "graphify not installed". Check upfront and give it
      // a distinct message instead.
      if (!existsSync(cwd)) {
        if (!win.isDestroyed()) {
          win.webContents.send('graphify:data', id, `Error: project directory not found: ${cwd}\r\n`)
          win.webContents.send('graphify:exit', id, 1)
        }
        return
      }

      this.runningByWindow.set(win.id, true)
      const bin = (await resolveGraphifyPath()) ?? 'graphify'
      const proc = spawn(bin, ['update', cwd], { cwd, stdio: ['ignore', 'pipe', 'pipe'] })

      proc.stdout.on('data', (chunk: Buffer) => {
        if (!win.isDestroyed()) win.webContents.send('graphify:data', id, chunk.toString())
      })
      proc.stderr.on('data', (chunk: Buffer) => {
        if (!win.isDestroyed()) win.webContents.send('graphify:data', id, chunk.toString())
      })
      proc.on('error', (err: NodeJS.ErrnoException) => {
        this.runningByWindow.set(win.id, false)
        if (win.isDestroyed()) return
        if (err.code === 'ENOENT') {
          win.webContents.send('graphify:data', id, NOT_INSTALLED_MESSAGE)
        } else {
          win.webContents.send('graphify:data', id, `\r\nError: ${err.message}\r\n`)
        }
        win.webContents.send('graphify:exit', id, 1)
      })
      proc.on('close', (code: number | null) => {
        this.runningByWindow.set(win.id, false)
        if (!win.isDestroyed()) win.webContents.send('graphify:exit', id, code ?? 1)
      })
    })

    // One-shot, non-streaming: registers graphify's Claude Code skill for
    // `cwd` (`.claude/skills/graphify/`, a CLAUDE.md section, project-scoped
    // — no --strict, so it doesn't start blocking Claude's tool calls) so
    // Claude can invoke graphify's own query/path/explain commands on this
    // project instead of only being usable from this panel. Stages the
    // resulting files afterward (see stageInstalledSkillFiles) so they're
    // ready to commit and share with the team without an extra manual step.
    ipcMain.handle('graphify:installClaudeSkill', async (_e, cwd: string): Promise<{ ok: boolean; output: string }> => {
      if (!existsSync(cwd)) {
        return { ok: false, output: `Error: project directory not found: ${cwd}` }
      }
      const result = await runClaudeSkillInstall(cwd)
      if (result.ok) await stageInstalledSkillFiles(cwd)
      return result
    })

    // Run on project open: when the project has the graphify skill but its
    // .claude/settings.json hooks point at a graphify binary that doesn't
    // exist on this machine (committed from someone else's), re-run the
    // install so the hooks point at this machine's binary. Deliberately not
    // staged, unlike the button above: the rewritten path is machine-local
    // and the user didn't ask for anything to be committed.
    ipcMain.handle('graphify:repairHooksIfNeeded', async (_e, cwd: string): Promise<{ repaired: boolean; ok: boolean; output: string }> => {
      const broken = await findBrokenGraphifyHookPaths(cwd)
      if (broken.length === 0) return { repaired: false, ok: true, output: '' }
      const result = await runClaudeSkillInstall(cwd)
      if (!result.ok) console.error('[graphify] failed to repair Claude Code hooks:', result.output)
      return { repaired: result.ok, ...result }
    })

    // Same marker `graphify install --platform claude --project` writes, so
    // the settings page can show whether this project is already set up.
    // Drives the "set up graphify for Claude Code" notification: only once a
    // graph has been built here and the project skill isn't installed yet.
    ipcMain.handle('graphify:needsClaudeSkill', (_e, cwd: string) =>
      existsSync(join(cwd, 'graphify-out')) && !existsSync(join(cwd, '.claude', 'skills', 'graphify', 'SKILL.md')))
    ipcMain.handle('graphify:needsGitignore', (_e, cwd: string) => graphifyOutNeedsGitignore(cwd))
    ipcMain.handle('graphify:addToGitignore', (_e, cwd: string) => addGraphifyOutToGitignore(cwd))

    ipcMain.handle('graphify:readGraph', async (_e, cwd: string): Promise<GraphifyGraph> => {
      const raw = await readFile(join(cwd, 'graphify-out', 'graph.json'), 'utf-8')
      const parsed = JSON.parse(raw)
      // graphify's graph.json schema is undocumented upstream and could
      // change; a minimal shape guard here keeps a malformed-but-valid JSON
      // payload from flowing through to computeGraphLayout/GraphView (which
      // would throw on undefined.length with no top-level error boundary to
      // catch it) — throwing here routes into the same catch-and-set-null
      // path the renderer store already uses for parse failures.
      if (!Array.isArray(parsed?.nodes) || !Array.isArray(parsed?.links)) {
        throw new Error('graphify-out/graph.json has an unexpected shape (missing nodes/links arrays)')
      }
      return parsed as GraphifyGraph
    })
  }

  private async checkAvailable(): Promise<boolean> {
    const bin = (await resolveGraphifyPath()) ?? 'graphify'
    return new Promise((resolve) => {
      const proc = spawn(bin, ['--help'], { stdio: 'ignore' })
      proc.on('spawn', () => resolve(true))
      proc.on('error', () => resolve(false))
    })
  }
}
