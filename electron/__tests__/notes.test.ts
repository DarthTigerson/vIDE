import { describe, it, expect, beforeEach, vi } from 'vitest'

const { handlers, fsState } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => unknown>,
  fsState: { files: new Map<string, string>(), dirs: new Set<string>(['/fake/userData']) },
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/fake/userData' },
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => unknown) => {
      handlers[channel] = fn
    },
  },
}))

vi.mock('fs/promises', () => ({
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

import { registerNotesHandlers } from '../notes'

describe('notes', () => {
  beforeEach(() => {
    fsState.files.clear()
    fsState.dirs.clear()
    fsState.dirs.add('/fake/userData')
    registerNotesHandlers()
  })

  it('getRoot creates and returns the fixed notes directory under userData', async () => {
    const root = (await handlers['notes:getRoot']()) as string
    expect(root).toBe('/fake/userData/notes')
    expect(fsState.dirs.has('/fake/userData/notes')).toBe(true)
  })

  describe('notes and folders', () => {
    it('createNote appends .md and strips any typed extension', async () => {
      const root = (await handlers['notes:getRoot']()) as string
      const result = (await handlers['notes:createNote']({}, root, 'Meeting.txt')) as any
      expect(result.name).toBe('Meeting.md')
      expect(fsState.files.has(`${root}/Meeting.md`)).toBe(true)
    })

    it('createNote rejects a name that collides with an existing note', async () => {
      const root = (await handlers['notes:getRoot']()) as string
      await handlers['notes:createNote']({}, root, 'Meeting')
      await expect(handlers['notes:createNote']({}, root, 'Meeting')).rejects.toThrow()
    })

    it('createFolder rejects a name with a path separator', async () => {
      const root = (await handlers['notes:getRoot']()) as string
      await expect(handlers['notes:createFolder']({}, root, 'a/b')).rejects.toThrow()
    })

    it('createFolder rejects an empty name', async () => {
      const root = (await handlers['notes:getRoot']()) as string
      await expect(handlers['notes:createFolder']({}, root, '  ')).rejects.toThrow()
    })

    it('renameEntry on a note strips any typed extension and forces .md', async () => {
      const root = (await handlers['notes:getRoot']()) as string
      const note = (await handlers['notes:createNote']({}, root, 'Old')) as any
      const renamed = (await handlers['notes:renameEntry']({}, note.path, 'New.txt', true)) as any
      expect(renamed.name).toBe('New.md')
      expect(fsState.files.has(`${root}/New.md`)).toBe(true)
      expect(fsState.files.has(note.path)).toBe(false)
    })

    it('renameEntry on a folder does not force an extension', async () => {
      const root = (await handlers['notes:getRoot']()) as string
      const folder = (await handlers['notes:createFolder']({}, root, 'Old')) as any
      const renamed = (await handlers['notes:renameEntry']({}, folder.path, 'New', false)) as any
      expect(renamed.name).toBe('New')
    })

    it('renameEntry rejects when the destination name already exists', async () => {
      const root = (await handlers['notes:getRoot']()) as string
      const a = (await handlers['notes:createNote']({}, root, 'A')) as any
      await handlers['notes:createNote']({}, root, 'B')
      await expect(handlers['notes:renameEntry']({}, a.path, 'B', true)).rejects.toThrow()
    })
  })
})
