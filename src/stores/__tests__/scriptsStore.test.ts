import { describe, it, expect, beforeEach, vi } from 'vitest'

const { notifySettingChanged, notifyNoteChanged } = vi.hoisted(() => ({ notifySettingChanged: vi.fn(), notifyNoteChanged: vi.fn() }))
vi.mock('@/lib/notifySettingChanged', () => ({ notifySettingChanged, notifyNoteChanged }))

import { useScriptsStore } from '../scriptsStore'
import type { Script } from '@/types/api'

const script: Script = {
  id: 's1', title: 'Pre-commit', description: '', body: 'pre-commit run', shareOutput: true, createdAt: 1, updatedAt: 1,
}

const api = {
  scriptsList: vi.fn(async () => [script]),
  scriptsTags: vi.fn(async () => ({ s1: ['/p'] })),
  scriptsCreate: vi.fn(async () => script),
  scriptsUpdate: vi.fn(async () => ({ ...script, title: 'New' })),
  scriptsDelete: vi.fn(async () => {}),
  scriptsTagAdd: vi.fn(async () => ({ s1: ['/p', '/q'] })),
  scriptsTagRemove: vi.fn(async () => ({})),
}
vi.stubGlobal('window', { api })

describe('scriptsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useScriptsStore.setState({ scripts: [], tags: {}, loaded: false })
  })

  it('load fetches scripts and tags', async () => {
    await useScriptsStore.getState().load()
    expect(useScriptsStore.getState()).toMatchObject({ scripts: [script], tags: { s1: ['/p'] }, loaded: true })
  })

  it('script mutations schedule a sync push', async () => {
    await useScriptsStore.getState().create({ title: 'Pre-commit' })
    await useScriptsStore.getState().update('s1', { title: 'New' })
    await useScriptsStore.getState().remove('s1')
    expect(api.scriptsCreate).toHaveBeenCalledWith({ title: 'Pre-commit' })
    expect(notifySettingChanged).toHaveBeenCalledTimes(3)
  })

  it('tag changes never schedule a sync push', async () => {
    await useScriptsStore.getState().addTag('s1', '/q')
    await useScriptsStore.getState().removeTag('s1', '/q')
    expect(api.scriptsTagAdd).toHaveBeenCalledWith('s1', '/q')
    expect(notifySettingChanged).not.toHaveBeenCalled()
  })
})

describe('scriptsStore editor saves', () => {
  it('editor content saves use the long (note) sync debounce, not the 2s settings one', async () => {
    vi.clearAllMocks()
    await useScriptsStore.getState().update('s1', { body: 'x' }, { fromEditor: true })
    expect(notifySettingChanged).not.toHaveBeenCalled()
    expect(notifyNoteChanged).toHaveBeenCalledTimes(1)
  })
})
