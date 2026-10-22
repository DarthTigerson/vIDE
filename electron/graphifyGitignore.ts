import { execFile } from 'child_process'
import { readFile, appendFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

export type GraphifyGitignoreStatus = 'ignored' | 'notIgnored' | 'notRepo'

const ENTRY = 'graphify-out/'

// Asks git itself rather than parsing .gitignore, so a rule anywhere git
// honors (a parent .gitignore, .git/info/exclude, the global excludesfile,
// a broader pattern like `*-out/`) counts. `check-ignore -q` exits 0 when
// ignored, 1 when not, and 128 when cwd isn't inside a git repo.
export function getGraphifyGitignoreStatus(cwd: string): Promise<GraphifyGitignoreStatus> {
  return new Promise((resolve) => {
    execFile('git', ['check-ignore', '-q', ENTRY], { cwd }, (err) => {
      if (!err) return resolve('ignored')
      resolve((err as { code?: unknown }).code === 1 ? 'notIgnored' : 'notRepo')
    })
  })
}

// Appends to the project root's own .gitignore (creating it if missing),
// since that's where graphify writes graphify-out/. Adds a separating
// newline first when the existing file doesn't end with one.
export async function addGraphifyOutToGitignore(cwd: string): Promise<{ ok: boolean; output: string }> {
  const status = await getGraphifyGitignoreStatus(cwd)
  if (status === 'notRepo') return { ok: false, output: 'This project is not a git repository.' }
  if (status === 'ignored') return { ok: true, output: '' }

  const path = join(cwd, '.gitignore')
  try {
    const existing = await readFile(path, 'utf-8').catch(() => '')
    const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''
    await appendFile(path, `${prefix}${ENTRY}\n`, 'utf-8')
    return { ok: true, output: '' }
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : String(err) }
  }
}

// Drives the "graphify-out/ isn't gitignored" notification: only worth
// raising once a graph has actually been built here and the repo isn't
// already ignoring it.
export async function graphifyOutNeedsGitignore(cwd: string): Promise<boolean> {
  if (!existsSync(join(cwd, 'graphify-out'))) return false
  return (await getGraphifyGitignoreStatus(cwd)) === 'notIgnored'
}
