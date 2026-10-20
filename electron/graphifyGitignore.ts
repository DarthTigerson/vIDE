import { execFile } from 'child_process'
import { readFile, appendFile, writeFile } from 'fs/promises'
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

// Lines that only exist to ignore graphify-out at the project root; anything
// broader (`*-out/`, a parent .gitignore, the global excludesfile) is left
// alone, so the folder can still read as ignored after this runs.
const ENTRY_VARIANTS = new Set(['graphify-out', 'graphify-out/', '/graphify-out', '/graphify-out/'])

export async function removeGraphifyOutFromGitignore(cwd: string): Promise<{ ok: boolean; output: string }> {
  const path = join(cwd, '.gitignore')
  try {
    const existing = await readFile(path, 'utf-8').catch(() => null)
    if (existing === null) return { ok: true, output: '' }
    const kept = existing.split('\n').filter((line) => !ENTRY_VARIANTS.has(line.trim()))
    const next = kept.join('\n')
    if (next !== existing) await writeFile(path, next, 'utf-8')
    return { ok: true, output: '' }
  } catch (err) {
    return { ok: false, output: err instanceof Error ? err.message : String(err) }
  }
}
