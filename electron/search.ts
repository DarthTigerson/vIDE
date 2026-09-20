import { spawn, type ChildProcess } from 'child_process'
import { StringDecoder } from 'string_decoder'
import { ipcMain, type WebContents } from 'electron'
import { buildRgArgs, parseRgMessage, type SearchBatch, type SearchDone, type SearchHit, type SearchOptions } from './searchArgs'

interface ManagerOptions {
  maxMatches?: number
}

const DEFAULT_MAX_MATCHES = 10_000
const FLUSH_INTERVAL_MS = 50
const FLUSH_SIZE = 500
const MAX_STDERR = 4096

let rgPathPromise: Promise<string> | null = null

// The binary lives in a per-platform optional dependency. In a packaged app
// that's inside app.asar, where it can't be executed — electron-builder's
// asarUnpack copies it out to app.asar.unpacked, so point there instead.
async function resolveRgPath(): Promise<string> {
  rgPathPromise ??= import('@vscode/ripgrep').then(({ rgPath }) =>
    rgPath.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'),
  )
  return rgPathPromise
}

// rg prints "./rel/path"; rebuild the path from the caller's own root string so
// results match editor tab paths exactly (symlinks and all).
function joinRoot(root: string, rgPath: string): string {
  const rel = rgPath.startsWith('./') ? rgPath.slice(2) : rgPath
  return `${root.replace(/\/$/, '')}/${rel}`
}

interface RunningSearch {
  id: string
  child: ChildProcess | null
  cancelled: boolean
}

// One search at a time: starting a new one (or cancelling) kills the previous
// ripgrep process, so typing quickly never leaves a pile of them running.
export class SearchManager {
  private current: RunningSearch | null = null
  private readonly maxMatches: number

  constructor(
    private readonly onResults: (batch: SearchBatch) => void,
    private readonly onDone: (done: SearchDone) => void,
    options: ManagerOptions = {},
  ) {
    this.maxMatches = options.maxMatches ?? DEFAULT_MAX_MATCHES
  }

  start(searchId: string, root: string, options: SearchOptions): void {
    this.cancel()
    const search: RunningSearch = { id: searchId, child: null, cancelled: false }
    this.current = search
    void this.run(search, root, options)
  }

  cancel(searchId?: string): void {
    const search = this.current
    if (!search || (searchId !== undefined && search.id !== searchId)) return
    search.cancelled = true
    search.child?.kill()
    this.current = null
  }

  private async run(search: RunningSearch, root: string, options: SearchOptions): Promise<void> {
    let rgPath: string
    try {
      rgPath = await resolveRgPath()
    } catch (error) {
      this.finish(search, { fileCount: 0, matchCount: 0, truncated: false, error: `ripgrep is unavailable: ${(error as Error).message}` })
      return
    }
    if (search.cancelled) return

    const skip = new Set(options.skipPaths)
    const files = new Set<string>()
    let matchCount = 0
    let truncated = false
    let pending: SearchHit[] = []
    let flushTimer: ReturnType<typeof setTimeout> | null = null
    let stderr = ''
    let carry = ''
    const decoder = new StringDecoder('utf8')

    const flush = () => {
      if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
      if (pending.length === 0 || search.cancelled) { pending = []; return }
      const hits = pending
      pending = []
      this.onResults({ searchId: search.id, hits })
    }

    const handleLine = (line: string) => {
      if (truncated || !line) return
      const hits = parseRgMessage(line)
      if (!hits) return
      for (const hit of hits) {
        hit.path = joinRoot(root, hit.path)
        if (skip.has(hit.path)) continue
        if (matchCount >= this.maxMatches) { truncated = true; break }
        matchCount++
        files.add(hit.path)
        pending.push(hit)
      }
      if (truncated) {
        child.kill()
      } else if (pending.length >= FLUSH_SIZE) {
        flush()
      } else if (!flushTimer) {
        flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS)
      }
    }

    const child = spawn(rgPath, buildRgArgs(options), { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    search.child = child

    child.stdout!.on('data', (chunk: Buffer) => {
      carry += decoder.write(chunk)
      let newline: number
      while ((newline = carry.indexOf('\n')) !== -1) {
        handleLine(carry.slice(0, newline))
        carry = carry.slice(newline + 1)
      }
    })
    child.stderr!.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_STDERR) stderr += chunk.toString('utf8')
    })

    child.on('error', (error) => {
      flush()
      this.finish(search, { fileCount: files.size, matchCount, truncated, error: `Could not start ripgrep: ${error.message}` })
    })

    child.on('close', (code) => {
      carry += decoder.end()
      if (carry) handleLine(carry)
      flush()
      // rg exits 1 for "no matches" and 2 for errors — but also 2 when it
      // merely couldn't read some file while still finding others. Only an
      // error with nothing found (a bad regex or glob) is worth surfacing.
      const failed = code === 2 && matchCount === 0 && stderr.trim().length > 0
      this.finish(search, {
        fileCount: files.size,
        matchCount,
        truncated,
        error: failed ? stderr.trim().slice(0, 500) : undefined,
      })
    })
  }

  private finish(search: RunningSearch, result: Omit<SearchDone, 'searchId'>): void {
    if (search.cancelled) return
    if (this.current === search) this.current = null
    this.onDone({ searchId: search.id, ...result })
  }
}

const managers = new Map<number, SearchManager>()

function managerFor(sender: WebContents): SearchManager {
  let manager = managers.get(sender.id)
  if (!manager) {
    manager = new SearchManager(
      (batch) => { if (!sender.isDestroyed()) sender.send('search:results', batch) },
      (done) => { if (!sender.isDestroyed()) sender.send('search:done', done) },
    )
    managers.set(sender.id, manager)
    sender.once('destroyed', () => {
      manager!.cancel()
      managers.delete(sender.id)
    })
  }
  return manager
}

export function registerSearchHandlers(): void {
  ipcMain.on('search:start', (event, searchId: string, root: string, options: SearchOptions) => {
    managerFor(event.sender).start(searchId, root, options)
  })
  ipcMain.on('search:cancel', (event, searchId: string) => {
    managerFor(event.sender).cancel(searchId)
  })
}
