import { app, ipcMain } from 'electron'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { readImageDataUrl } from './fsOps'
import * as store from './todosStore'
import type { TodoPatch, TodoStatus } from './todosStore'

function dataDir(): string {
  return app.getPath('userData')
}

async function saveAttachment(dataUrl: string): Promise<string> {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const id = crypto.randomUUID()
  const dir = store.attachmentsDir(dataDir())
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${id}.png`), Buffer.from(base64, 'base64'))
  return id
}

async function readAttachmentDataUrl(id: string): Promise<string> {
  return readImageDataUrl(join(store.attachmentsDir(dataDir()), `${id}.png`))
}

export function registerTodoHandlers(): void {
  ipcMain.handle('todos:listProjects', () => store.listProjects(dataDir()))
  ipcMain.handle('todos:createProject', (_e, name: string, key: string) =>
    store.createProject(dataDir(), name, key)
  )
  ipcMain.handle('todos:listTodos', (_e, projectId: string) => store.listTodos(dataDir(), projectId))
  ipcMain.handle('todos:createTodo', (_e, projectId: string, title: string) =>
    store.createTodo(dataDir(), projectId, title)
  )
  ipcMain.handle('todos:updateTodo', (_e, id: string, patch: TodoPatch) => store.updateTodo(dataDir(), id, patch))
  ipcMain.handle('todos:reorderTodo', (_e, id: string, status: TodoStatus, beforeId: string | null) =>
    store.reorderTodo(dataDir(), id, status, beforeId)
  )
  ipcMain.handle('todos:archiveTodo', (_e, id: string, archived: boolean) =>
    store.archiveTodo(dataDir(), id, archived)
  )
  ipcMain.handle('todos:deleteTodo', (_e, id: string) => store.deleteTodo(dataDir(), id))
  ipcMain.handle('todos:addComment', (_e, todoId: string, body: string, attachments?: string[]) =>
    store.addComment(dataDir(), todoId, body, attachments)
  )
  ipcMain.handle('todos:saveAttachment', (_e, dataUrl: string) => saveAttachment(dataUrl))
  ipcMain.handle('todos:readAttachmentDataUrl', (_e, id: string) => readAttachmentDataUrl(id))
}
