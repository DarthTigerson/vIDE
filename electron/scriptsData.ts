import { join } from 'path'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'

export { normalizeBody, scriptDisplayTitle } from '../src/lib/scriptBody'

// Scripts are plain records in one JSON file under userData. No `electron`
// import here: the vide-scripts MCP server reads and writes the same file
// from its own process.
export interface Script {
  id: string
  title: string
  description: string
  body: string
  // Whether run_script hands the terminal output back to Claude, or only
  // success/failure.
  shareOutput: boolean
  createdAt: number
  updatedAt: number
  // A tombstone rather than a hard delete, so vIDE Sync's additive merge
  // carries the delete to other machines instead of resurrecting it.
  deletedAt?: number
}

export interface ScriptsData {
  scripts: Script[]
}

export function scriptsFile(dataDir: string): string {
  return join(dataDir, 'scripts.json')
}

// For writers: a missing file is empty, but a corrupt one is an error — the
// lenient reader's "corrupt = empty" would have the next write wipe every
// script.
async function readForWrite(dataDir: string): Promise<ScriptsData> {
  let raw: string
  try {
    raw = await readFile(scriptsFile(dataDir), 'utf8')
  } catch {
    return { scripts: [] }
  }
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed?.scripts)) return { scripts: parsed.scripts }
  } catch { /* fall through */ }
  throw new Error(`${scriptsFile(dataDir)} is corrupt; not overwriting it`)
}

// Every read-modify-write in this process runs one at a time, so overlapping
// saves (two editor tabs, a save during a sync push) can't interleave.
let writeQueue: Promise<unknown> = Promise.resolve()
export function mutateScriptsData<T>(dataDir: string, fn: (data: ScriptsData) => T): Promise<T> {
  const next = writeQueue.then(async () => {
    const data = await readForWrite(dataDir)
    const result = fn(data)
    await writeScriptsData(dataDir, data)
    return result
  })
  writeQueue = next.catch(() => {})
  return next
}

export async function readScriptsData(dataDir: string): Promise<ScriptsData> {
  try {
    const parsed = JSON.parse(await readFile(scriptsFile(dataDir), 'utf8'))
    return Array.isArray(parsed?.scripts) ? { scripts: parsed.scripts } : { scripts: [] }
  } catch {
    return { scripts: [] }
  }
}

// Write-then-rename so the file watcher and the MCP server never see a
// half-written file.
export async function writeScriptsData(dataDir: string, data: ScriptsData): Promise<void> {
  await mkdir(dataDir, { recursive: true })
  const file = scriptsFile(dataDir)
  const tmp = `${file}.${randomUUID()}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmp, file)
}

export function liveScripts(data: ScriptsData): Script[] {
  return data.scripts.filter((s) => s.deletedAt === undefined)
}

export async function createScript(
  dataDir: string,
  input: { title: string; description?: string; body?: string; shareOutput?: boolean },
): Promise<Script> {
  const now = Date.now()
  const script: Script = {
    id: randomUUID(),
    title: input.title,
    description: input.description ?? '',
    body: input.body ?? '',
    shareOutput: input.shareOutput ?? true,
    createdAt: now,
    updatedAt: now,
  }
  await mutateScriptsData(dataDir, (data) => { data.scripts.push(script) })
  return script
}

export async function updateScript(
  dataDir: string,
  id: string,
  patch: Partial<Pick<Script, 'title' | 'description' | 'body' | 'shareOutput'>>,
): Promise<Script> {
  return mutateScriptsData(dataDir, (data) => {
    const index = data.scripts.findIndex((s) => s.id === id && s.deletedAt === undefined)
    if (index === -1) throw new Error(`Script "${id}" not found`)
    const updated: Script = { ...data.scripts[index], ...definedOnly(patch), updatedAt: Date.now() }
    data.scripts[index] = updated
    return updated
  })
}

export async function deleteScript(dataDir: string, id: string): Promise<void> {
  await mutateScriptsData(dataDir, (data) => {
    const index = data.scripts.findIndex((s) => s.id === id)
    if (index === -1) return
    const now = Date.now()
    data.scripts[index] = { ...data.scripts[index], body: '', deletedAt: now, updatedAt: now }
  })
}

function definedOnly<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>
}
