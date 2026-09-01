import { ipcMain, BrowserWindow } from 'electron'
import { spawn, type ChildProcessByStdio } from 'child_process'
import type { Readable } from 'stream'
import {
  checkDockerStatus,
  listContainers,
  startContainer,
  stopContainer,
  restartContainer,
  removeContainer,
  startContainers,
  stopContainers,
  removeContainers,
  openDockerApp,
} from './docker'
import { resolveBinaryPath } from './lsp/shellPath'

type DockerLogsProc = ChildProcessByStdio<null, Readable, Readable>

export class DockerRunner {
  private logProcs = new Map<string, DockerLogsProc>()

  registerHandlers(): void {
    ipcMain.handle('docker:status', () => checkDockerStatus())
    ipcMain.handle('docker:listContainers', () => listContainers())
    ipcMain.handle('docker:startContainer', (_e, id: string) => startContainer(id))
    ipcMain.handle('docker:stopContainer', (_e, id: string) => stopContainer(id))
    ipcMain.handle('docker:restartContainer', (_e, id: string) => restartContainer(id))
    ipcMain.handle('docker:removeContainer', (_e, id: string) => removeContainer(id))
    ipcMain.handle('docker:startContainers', (_e, ids: string[]) => startContainers(ids))
    ipcMain.handle('docker:stopContainers', (_e, ids: string[]) => stopContainers(ids))
    ipcMain.handle('docker:removeContainers', (_e, ids: string[]) => removeContainers(ids))
    ipcMain.handle('docker:openApp', () => openDockerApp())

    ipcMain.handle('docker:runLogs', async (event, streamId: string, containerId: string) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      this.stopLogs(streamId)

      const bin = (await resolveBinaryPath('docker')) ?? 'docker'
      if (win.isDestroyed()) return
      const proc = spawn(bin, ['logs', '-f', '--tail', '200', containerId], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      this.logProcs.set(streamId, proc)

      proc.stdout.on('data', (chunk: Buffer) => {
        if (!win.isDestroyed()) win.webContents.send('docker:log:data', streamId, chunk.toString())
      })
      proc.stderr.on('data', (chunk: Buffer) => {
        if (!win.isDestroyed()) win.webContents.send('docker:log:data', streamId, chunk.toString())
      })
      proc.on('close', (code: number | null) => {
        this.logProcs.delete(streamId)
        if (!win.isDestroyed()) win.webContents.send('docker:log:exit', streamId, code ?? 1)
      })
    })

    ipcMain.on('docker:stopLogs', (_e, streamId: string) => this.stopLogs(streamId))
  }

  private stopLogs(streamId: string): void {
    const proc = this.logProcs.get(streamId)
    if (proc) {
      proc.kill()
      this.logProcs.delete(streamId)
    }
  }
}
