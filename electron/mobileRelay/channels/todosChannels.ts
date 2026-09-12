import { registerChannel } from '../dispatch'
import { app } from 'electron'
import * as store from '../../todosStore'
import { readImageDataUrl } from '../../fsOps'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import type { TodoPatch, TodoStatus } from '../../todosStore'

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

export function registerTodosRelayChannels(): void {
  registerChannel('todos:listProjects', () => store.listProjects(dataDir()))
  registerChannel('todos:createProject', (name: string, key: string) =>
    store.createProject(dataDir(), name, key))
  registerChannel('todos:renameProject', (id: string, name: string, key: string) =>
    store.renameProject(dataDir(), id, name, key))
  registerChannel('todos:deleteProject', (id: string) => store.deleteProject(dataDir(), id))
  registerChannel('todos:listTodos', (projectId: string) => store.listTodos(dataDir(), projectId))
  registerChannel('todos:createTodo', (projectId: string, title: string) =>
    store.createTodo(dataDir(), projectId, title))
  registerChannel('todos:updateTodo', (id: string, patch: TodoPatch) => store.updateTodo(dataDir(), id, patch))
  registerChannel('todos:reorderTodo', (id: string, status: TodoStatus, beforeId: string | null) =>
    store.reorderTodo(dataDir(), id, status, beforeId))
  registerChannel('todos:archiveTodo', (id: string, archived: boolean) =>
    store.archiveTodo(dataDir(), id, archived))
  registerChannel('todos:archiveTodos', (ids: string[], archived: boolean) =>
    store.archiveTodos(dataDir(), ids, archived))
  registerChannel('todos:deleteTodo', (id: string) => store.deleteTodo(dataDir(), id))
  registerChannel('todos:addComment', (todoId: string, body: string, attachments?: string[]) =>
    store.addComment(dataDir(), todoId, body, attachments))
  registerChannel('todos:saveAttachment', (dataUrl: string) => saveAttachment(dataUrl))
  registerChannel('todos:readAttachmentDataUrl', (id: string) => readAttachmentDataUrl(id))
}
