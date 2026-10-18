import { app, ipcMain } from 'electron'
import { createHash } from 'crypto'
import { join } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

// Every field is optional: several writers each own a slice of this file
// (claudeStore the agent sessions, lib/editorSession.ts the editor tabs, main
// the window bounds) and saveSession merges each slice into what is already
// on disk rather than replacing the whole file.
export interface SessionData {
  layout?: unknown
  paneTabs?: Record<string, string | null>
  paneTabLists?: Record<string, string[]>
  activeTabPath?: string | null
  activePaneId?: string
  tabs?: { path: string }[]
  browserUrls?: Record<string, string>
  claudeInstances?: { id: string; hue: string }[]
  // Mixed agent sessions (Claude / Bridge / llama:<id>) in activity-bar
  // order. claudeInstances is the pre-mixed-sessions field, read only as a
  // fallback when this is absent.
  agentSessions?: { id: string; kind: string; hue: string; name?: string }[]
  // Size/position of the last window this project was open in, so it
  // reopens where it was — at relaunch and from Recent Projects alike.
  windowBounds?: WindowBounds
}

// Colour and name of every agent session seen in a session file this run,
// keyed by instance id — the RAM panel colours each session's row with it,
// including sessions that belong to another window.
const agentSessionInfo = new Map<string, { hue: string; name?: string }>()

function rememberAgentSessions(data: SessionData | null): void {
  for (const s of data?.agentSessions ?? []) {
    if (typeof s?.id === 'string' && typeof s.hue === 'string') {
      agentSessionInfo.set(s.id, { hue: s.hue, ...(typeof s.name === 'string' ? { name: s.name } : {}) })
    }
  }
}

export function getAgentSessionInfo(instanceId: string): { hue: string; name?: string } | undefined {
  return agentSessionInfo.get(instanceId)
}

function sessionPathFor(projectRoot: string): string {
  const hash = createHash('sha1').update(projectRoot).digest('hex')
  return join(app.getPath('userData'), 'sessions', `${hash}.json`)
}

export async function loadSession(projectRoot: string): Promise<SessionData | null> {
  try {
    const data: SessionData = JSON.parse(await readFile(sessionPathFor(projectRoot), 'utf-8'))
    rememberAgentSessions(data)
    return data
  } catch {
    return null
  }
}

// Read-merge-write, chained per file so two writers landing together (a tab
// change and a window close, say) can't both read the old file and have the
// second write drop the first one's slice.
const pendingWrites = new Map<string, Promise<void>>()

export function saveSession(projectRoot: string, data: SessionData): Promise<void> {
  rememberAgentSessions(data)
  const path = sessionPathFor(projectRoot)
  const previous = pendingWrites.get(path) ?? Promise.resolve()
  const next = previous.then(async () => {
    try {
      const existing = (await loadSession(projectRoot)) ?? {}
      await mkdir(join(app.getPath('userData'), 'sessions'), { recursive: true })
      await writeFile(path, JSON.stringify({ ...existing, ...data }), 'utf-8')
    } catch {}
  })
  pendingWrites.set(path, next)
  void next.then(() => { if (pendingWrites.get(path) === next) pendingWrites.delete(path) })
  return next
}

// The project roots of the windows open when vIDE last quit, in the order
// they were opened, so the next launch can bring each one back.
function windowSessionPath(): string {
  return join(app.getPath('userData'), 'window-session.json')
}

export async function loadOpenWindows(): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readFile(windowSessionPath(), 'utf-8'))
    return Array.isArray(parsed?.projectRoots)
      ? parsed.projectRoots.filter((root: unknown): root is string => typeof root === 'string')
      : []
  } catch {
    return []
  }
}

export async function saveOpenWindows(projectRoots: string[]): Promise<void> {
  try {
    await writeFile(windowSessionPath(), JSON.stringify({ projectRoots }), 'utf-8')
  } catch {}
}

export function registerSessionHandlers(): void {
  ipcMain.handle('session:load', (_e, projectRoot: string) => loadSession(projectRoot))
  ipcMain.handle('session:save', (_e, projectRoot: string, data: SessionData) => saveSession(projectRoot, data))
}
