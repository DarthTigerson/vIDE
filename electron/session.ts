import { app, ipcMain } from 'electron'
import { createHash } from 'crypto'
import { join } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'

export interface SessionData {
  layout: unknown
  paneTabs: Record<string, string | null>
  paneTabLists: Record<string, string[]>
  activeTabPath: string | null
  activePaneId: string
  tabs: { path: string }[]
  browserUrls: Record<string, string>
  claudeInstances?: { id: string; hue: string }[]
}

function sessionPathFor(projectRoot: string): string {
  const hash = createHash('sha1').update(projectRoot).digest('hex')
  return join(app.getPath('userData'), 'sessions', `${hash}.json`)
}

export async function loadSession(projectRoot: string): Promise<SessionData | null> {
  try {
    const data = await readFile(sessionPathFor(projectRoot), 'utf-8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

export async function saveSession(projectRoot: string, data: SessionData): Promise<void> {
  try {
    const path = sessionPathFor(projectRoot)
    await mkdir(join(app.getPath('userData'), 'sessions'), { recursive: true })
    await writeFile(path, JSON.stringify(data), 'utf-8')
  } catch {}
}

export function registerSessionHandlers(): void {
  ipcMain.handle('session:load', (_e, projectRoot: string) => loadSession(projectRoot))
  ipcMain.handle('session:save', (_e, projectRoot: string, data: SessionData) => saveSession(projectRoot, data))
}
