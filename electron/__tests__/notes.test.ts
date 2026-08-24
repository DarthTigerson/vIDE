import { describe, it, expect, beforeEach, vi } from 'vitest'

const { handlers, fsState, trashed } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => unknown>,
  fsState: { files: new Map<string, string>(), dirs: new Set<string>(['/fake/userData']) },
  trashed: [] as string[],
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/fake/userData' },
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => unknown) => {
      handlers[channel] = fn
    },
  },
  shell: {
    trashItem: async (path: string) => {
      if (!fsState.dirs.has(path) && !fsState.files.has(path)) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }
      trashed.push(path)
      fsState.dirs.delete(path)
      fsState.files.delete(path)
    },
  },
}))

vi.mock('fs/promises', () => ({
  readFile: async (path: string) => {
    if (!fsState.files.has(path)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return fsState.files.get(path)!
  },
  writeFile: async (path: string, data: string, options?: { flag?: string }) => {
    if (options?.flag === 'wx' && (fsState.files.has(path) || fsState.dirs.has(path))) {
      throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' })
    }
    fsState.files.set(path, data)
  },
  mkdir: async (path: string, options?: { recursive?: boolean }) => {
    if (!options?.recursive && (fsState.dirs.has(path) || fsState.files.has(path))) {
      throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' })
    }
    fsState.dirs.add(path)
  },
  access: async (path: string) => {
    if (!fsState.files.has(path) && !fsState.dirs.has(path)) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    }
  },
  rename: async (from: string, to: string) => {
    if (fsState.files.has(from)) {
      fsState.files.set(to, fsState.files.get(from)!)
      fsState.files.delete(from)
    } else if (fsState.dirs.has(from)) {
      fsState.dirs.delete(from)
      fsState.dirs.add(to)
    } else {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    }
  },
}))

let uuidCounter = 0
vi.stubGlobal('crypto', {
  randomUUID: () => `uuid-${++uuidCounter}`,
})

import { registerNotesHandlers } from '../notes'

describe('notes', () => {
  beforeEach(() => {
    fsState.files.clear()
    fsState.dirs.clear()
    fsState.dirs.add('/fake/userData')
    trashed.length = 0
    uuidCounter = 0
    registerNotesHandlers()
  })

  describe('projects', () => {
    it('returns an empty list when nothing has been created yet', async () => {
      expect(await handlers['notes:listProjects']()).toEqual([])
    })

    it('createProject adds a notebook, listed with its rootPath', async () => {
      const project = (await handlers['notes:createProject']({}, 'Huginn')) as any
      expect(project).toMatchObject({ name: 'Huginn', rootPath: '/fake/userData/notes/uuid-1' })
      expect(fsState.dirs.has('/fake/userData/notes/uuid-1')).toBe(true)
      expect(await handlers['notes:listProjects']()).toEqual([project])
    })

    it('rejects an empty name', async () => {
      await expect(handlers['notes:createProject']({}, '   ')).rejects.toThrow()
    })

    it('renameProject updates the name but not the rootPath', async () => {
      const project = (await handlers['notes:createProject']({}, 'Huginn')) as any
      const renamed = (await handlers['notes:renameProject']({}, project.id, 'Renamed')) as any
      expect(renamed.name).toBe('Renamed')
      expect(renamed.rootPath).toBe(project.rootPath)
    })

    it('deleteProject removes it from the list and trashes its directory', async () => {
      const project = (await handlers['notes:createProject']({}, 'Huginn')) as any
      await handlers['notes:deleteProject']({}, project.id)
      expect(await handlers['notes:listProjects']()).toEqual([])
      expect(trashed).toContain(project.rootPath)
    })
  })

  describe('notes and folders', () => {
    it('createNote appends .md and strips any typed extension', async () => {
      const project = (await handlers['notes:createProject']({}, 'Huginn')) as any
      const result = (await handlers['notes:createNote']({}, project.rootPath, 'Meeting.txt')) as any
      expect(result.name).toBe('Meeting.md')
      expect(fsState.files.has(`${project.rootPath}/Meeting.md`)).toBe(true)
    })

    it('createNote rejects a name that collides with an existing note', async () => {
      const project = (await handlers['notes:createProject']({}, 'Huginn')) as any
      await handlers['notes:createNote']({}, project.rootPath, 'Meeting')
      await expect(handlers['notes:createNote']({}, project.rootPath, 'Meeting')).rejects.toThrow()
    })

    it('createFolder rejects a name with a path separator', async () => {
      const project = (await handlers['notes:createProject']({}, 'Huginn')) as any
      await expect(handlers['notes:createFolder']({}, project.rootPath, 'a/b')).rejects.toThrow()
    })

    it('createFolder rejects an empty name', async () => {
      const project = (await handlers['notes:createProject']({}, 'Huginn')) as any
      await expect(handlers['notes:createFolder']({}, project.rootPath, '  ')).rejects.toThrow()
    })

    it('renameEntry on a note strips any typed extension and forces .md', async () => {
      const project = (await handlers['notes:createProject']({}, 'Huginn')) as any
      const note = (await handlers['notes:createNote']({}, project.rootPath, 'Old')) as any
      const renamed = (await handlers['notes:renameEntry']({}, note.path, 'New.txt', true)) as any
      expect(renamed.name).toBe('New.md')
      expect(fsState.files.has(`${project.rootPath}/New.md`)).toBe(true)
      expect(fsState.files.has(note.path)).toBe(false)
    })

    it('renameEntry on a folder does not force an extension', async () => {
      const project = (await handlers['notes:createProject']({}, 'Huginn')) as any
      const folder = (await handlers['notes:createFolder']({}, project.rootPath, 'Old')) as any
      const renamed = (await handlers['notes:renameEntry']({}, folder.path, 'New', false)) as any
      expect(renamed.name).toBe('New')
    })

    it('renameEntry rejects when the destination name already exists', async () => {
      const project = (await handlers['notes:createProject']({}, 'Huginn')) as any
      const a = (await handlers['notes:createNote']({}, project.rootPath, 'A')) as any
      await handlers['notes:createNote']({}, project.rootPath, 'B')
      await expect(handlers['notes:renameEntry']({}, a.path, 'B', true)).rejects.toThrow()
    })
  })
})
