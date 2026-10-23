import { execFile, spawn } from 'child_process'
import { existsSync } from 'fs'
import { dirname, isAbsolute, join } from 'path'

// Electron-launched apps (Finder/Dock, not `npm run dev` from a terminal)
// don't inherit the interactive shell's PATH, so a bare spawn('gopls', ...)
// fails whenever a toolchain lives outside the default system PATH (nvm,
// rustup, a Go install under ~/go/bin, etc). Mirrors resolveGraphifyPath()
// in electron/graphify.ts / resolveClaudePath() in electron/autocomplete.ts:
// resolve the absolute path once via a login shell and cache it per command.
const cache = new Map<string, string | null>()
const pending = new Map<string, Promise<string | null>>()

export function resolveBinaryPath(command: string): Promise<string | null> {
  if (cache.has(command)) return Promise.resolve(cache.get(command) ?? null)
  const inFlight = pending.get(command)
  if (inFlight) return inFlight

  const promise = new Promise<string | null>((resolve) => {
    const shell = process.env.SHELL ?? '/bin/zsh'
    execFile(shell, ['-lic', `command -v ${command}`], (err, stdout) => {
      // `-lic` runs an interactive login shell, which sources .zshrc/.zprofile
      // and can prepend banners or version-manager output (nvm, pyenv, ...) to
      // stdout. Take the last non-empty line rather than the whole trimmed
      // output, and require it to look like an absolute path.
      const lines = (stdout ? stdout.toString() : '').split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
      const lastLine = lines[lines.length - 1]
      const resolved = !err && lastLine && lastLine.startsWith('/') ? lastLine : null
      // Only cache successes — caching a failure would silently disable
      // resolution for the rest of the app session on a transient hiccup.
      if (resolved) cache.set(command, resolved)
      resolve(resolved)
    })
  })
  pending.set(command, promise)
  promise.finally(() => pending.delete(command))
  return promise
}

// Env for running a resolved binary. Many are scripts (`#!/usr/bin/env node`
// for npm and npm-installed servers), so their interpreter must be on PATH;
// it sits next to the binary for Homebrew/nvm installs.
export function binaryEnv(binPath: string): NodeJS.ProcessEnv {
  if (!isAbsolute(binPath)) return process.env
  return { ...process.env, PATH: `${dirname(binPath)}:${process.env.PATH ?? ''}` }
}

// `go install` puts binaries in GOBIN, else GOPATH/bin, which is often not
// on PATH. Returns the binary there if present.
export async function resolveGoBinary(name: string): Promise<string | null> {
  const go = await resolveBinaryPath('go')
  if (!go) return null
  return new Promise((resolve) => {
    execFile(go, ['env', 'GOBIN', 'GOPATH'], (err, stdout) => {
      if (err) {
        resolve(null)
        return
      }
      const [gobin, gopath] = stdout.toString().split('\n').map((l) => l.trim())
      const dir = gobin || (gopath ? join(gopath.split(':')[0], 'bin') : '')
      const bin = dir ? join(dir, name) : ''
      resolve(bin && existsSync(bin) ? bin : null)
    })
  })
}

export function resolveVersion(binPath: string, versionArgs: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(binPath, versionArgs, { env: binaryEnv(binPath) }, (err, stdout, stderr) => {
      if (err) {
        resolve(null)
        return
      }
      const out = (stdout || stderr || '').toString().trim().split('\n')[0]
      resolve(out || null)
    })
  })
}

// Resolves `command` via the login shell (falling back to the bare name so a
// missing binary still surfaces a clear ENOENT rather than silently no-op'ing),
// then spawns it and streams stdout+stderr chunks to `onData` until it exits.
export async function resolveAndRunStreamed(
  command: string,
  args: string[],
  onData: (chunk: string) => void
): Promise<void> {
  const bin = (await resolveBinaryPath(command)) ?? command
  return runStreamed(bin, args, onData, command)
}

// Spawns `bin` and streams stdout+stderr chunks to `onData` until it exits.
// `command` is the name used in error messages.
export function runStreamed(
  bin: string,
  args: string[],
  onData: (chunk: string) => void,
  command = bin,
  extraEnv: NodeJS.ProcessEnv = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...binaryEnv(bin), ...extraEnv } })
    proc.stdout.on('data', (chunk: Buffer) => onData(chunk.toString()))
    proc.stderr.on('data', (chunk: Buffer) => onData(chunk.toString()))
    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') reject(new Error(`'${command}' not found in PATH.`))
      else reject(err)
    })
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`))))
  })
}

export function _resetShellPathCacheForTesting(): void {
  cache.clear()
  pending.clear()
}
