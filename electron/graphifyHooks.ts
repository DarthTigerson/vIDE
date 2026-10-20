import { execFile } from 'child_process'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

// `graphify install --platform claude --project` writes its PreToolUse hooks
// into .claude/settings.json using the absolute path of the graphify binary
// on the machine that ran it (e.g. /Users/<name>/.local/bin/graphify). Once
// that file is committed, every other machine gets a path that doesn't exist
// there and the hooks fail silently. This finds those dead paths so the
// install can be re-run locally to point them at this machine's binary.
// Only looks when graphify is actually in use on this machine: the skill is
// installed and a graph has been built locally. A graphify-out/ that came
// down with the repo (tracked by git) doesn't count, since its presence says
// nothing about whether this user ever ran graphify.
export async function findBrokenGraphifyHookPaths(cwd: string): Promise<string[]> {
  if (!existsSync(join(cwd, '.claude', 'skills', 'graphify', 'SKILL.md'))) return []
  if (!existsSync(join(cwd, 'graphify-out'))) return []
  if (await isTrackedByGit(cwd, 'graphify-out')) return []

  let settings: unknown
  try {
    settings = JSON.parse(await readFile(join(cwd, '.claude', 'settings.json'), 'utf-8'))
  } catch {
    return []
  }

  const broken = new Set<string>()
  for (const command of collectHookCommands(settings)) {
    const bin = command.trim().split(/\s+/)[0]
    if (!bin.startsWith('/') || !/(^|\/)graphify$/.test(bin)) continue
    if (!existsSync(bin)) broken.add(bin)
  }
  return [...broken]
}

// settings.hooks is { [event]: [{ matcher, hooks: [{ type, command }] }] };
// walked defensively since the file is hand-editable.
function collectHookCommands(settings: unknown): string[] {
  const hooks = (settings as { hooks?: unknown })?.hooks
  if (!hooks || typeof hooks !== 'object') return []
  const commands: string[] = []
  for (const groups of Object.values(hooks)) {
    if (!Array.isArray(groups)) continue
    for (const group of groups) {
      const entries = (group as { hooks?: unknown })?.hooks
      if (!Array.isArray(entries)) continue
      for (const entry of entries) {
        const command = (entry as { command?: unknown })?.command
        if (typeof command === 'string') commands.push(command)
      }
    }
  }
  return commands
}

// Any tracked file under `path` means it came from the repo. Outside a git
// repo ls-files errors, which counts as untracked.
function isTrackedByGit(cwd: string, path: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('git', ['ls-files', '--', path], { cwd }, (err, stdout) => {
      resolve(!err && String(stdout).trim().length > 0)
    })
  })
}
