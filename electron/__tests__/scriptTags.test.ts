import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { readScriptTags, addScriptTag, removeScriptTag } from '../scriptTags'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'tags-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('scriptTags', () => {
  it('starts empty', async () => {
    expect(await readScriptTags(dir)).toEqual({})
  })

  it('adds idempotently and persists', async () => {
    await addScriptTag(dir, 's1', '/repo/a')
    await addScriptTag(dir, 's1', '/repo/a')
    await addScriptTag(dir, 's1', '/repo/b')
    expect(await readScriptTags(dir)).toEqual({ s1: ['/repo/a', '/repo/b'] })
  })

  it('removing the last tag drops the key', async () => {
    await addScriptTag(dir, 's1', '/repo/a')
    expect(await removeScriptTag(dir, 's1', '/repo/a')).toEqual({})
  })
})
