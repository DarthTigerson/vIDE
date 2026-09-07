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

export function registerSessionHandlers(): void {
  ipcMain.handle('session:load', async (_e, projectRoot: string): Promise<SessionData | null> => {
    try {
      const data = await readFile(sessionPathFor(projectRoot), 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  })

  ipcMain.handle('session:save', async (_e, projectRoot: string, data: SessionData) => {
    try {
      const path = sessionPathFor(projectRoot)
      await mkdir(join(app.getPath('userData'), 'sessions'), { recursive: true })
      await writeFile(path, JSON.stringify(data), 'utf-8')
    } catch {}
  })
}
