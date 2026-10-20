import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { readFile, appendFile, writeFile } from 'fs/promises'
import { join } from 'path'

// Patterns are what gets written to .gitignore: `name/` for a folder, `name`
// for a file. Status asks git itself (`check-ignore`), so a rule anywhere git
// honors counts: a parent .gitignore, .git/info/exclude, the global
// excludesfile, or a broader pattern.
export type GitignoreStatus = { repo: false } | { repo: true; ignored: string[] }

export function getGitignoreStatus(cwd: string, patterns: string[]): Promise<GitignoreStatus> {
  return new Promise((resolve) => {
    if (patterns.length === 0) {
      // Still need to know whether cwd is a repo.
      execFile('git', ['rev-parse', '--git-dir'], { cwd }, (err) => resolve(err ? { repo: false } : { repo: true, ignored: [] }))
      return
    }
    // Exits 0 when at least one path is ignored (printing those), 1 when none
    // are, and 128 outside a git repo.
    execFile('git', ['check-ignore', '--', ...patterns], { cwd }, (err, stdout) => {
      const code = err ? (err as { code?: unknown }).code : 0
      if (code !== 0 && code !== 1) return resolve({ repo: false })
      const printed = new Set(String(stdout).split('\n').map((l) => l.trim()).filter(Boolean))
      resolve({ repo: true, ignored: patterns.filter((p) => printed.has(p)) })
    })
  })
}

// Appends to the project root's own .gitignore (creating it if missing).
export async function addGitignoreEntry(cwd: string, pattern: string): Promise<{ ok: boolean; output: string }> {
  const status = await getGitignoreStatus(cwd, [pattern])
  if (!status.repo) return { ok: false, output: 'This project is not a git repository.' }
  if (status.ignored.includes(pattern)) return { ok: true, output: '' }

  const path = join(cwd, '.gitignore')
  try {
    const existing = await readFile(path, 'utf-8').catch(() => '')
    const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''
    await appendFile(path, `${prefix}${pattern}\n`, 'utf-8')
    return { ok: true, output: '' }
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : String(err) }
  }
}

// Removes only lines that ignore exactly this name at the project root (with
// or without leading/trailing slashes). Broader rules are left alone, so the
// entry can still read as ignored afterwards.
export async function removeGitignoreEntry(cwd: string, pattern: string): Promise<{ ok: boolean; output: string }> {
  const name = pattern.replace(/^\/+|\/+$/g, '')
  const variants = new Set([name, `${name}/`, `/${name}`, `/${name}/`])
  const path = join(cwd, '.gitignore')
  try {
    const existing = await readFile(path, 'utf-8').catch(() => null)
    if (existing === null) return { ok: true, output: '' }
    const next = existing.split('\n').filter((line) => !variants.has(line.trim())).join('\n')
    if (next !== existing) await writeFile(path, next, 'utf-8')
    return { ok: true, output: '' }
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : String(err) }
  }
}

export function registerGitignoreHandlers(): void {
  ipcMain.handle('gitignore:status', (_e, cwd: string, patterns: string[]) => getGitignoreStatus(cwd, patterns))
  ipcMain.handle('gitignore:add', (_e, cwd: string, pattern: string) => addGitignoreEntry(cwd, pattern))
  ipcMain.handle('gitignore:remove', (_e, cwd: string, pattern: string) => removeGitignoreEntry(cwd, pattern))
}
