import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { isMultiRepoProject } from '../multiRepoPaths'

describe('isMultiRepoProject', () => {
  let dir: string
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'multirepo-')) })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  const repo = (rel: string) => fs.mkdirSync(path.join(dir, rel, '.git'), { recursive: true })

  it('is false for a folder that is itself a repo, even with nested repos', () => {
    repo('.')
    repo('packages/a')
    return expect(isMultiRepoProject(dir)).resolves.toBe(false)
  })

  it('is false with one nested repo and true with several', async () => {
    repo('apps')
    expect(await isMultiRepoProject(dir)).toBe(false)
    repo('infra/bases')
    expect(await isMultiRepoProject(dir)).toBe(true)
  })

  it('is false for a missing folder', () => {
    return expect(isMultiRepoProject(path.join(dir, 'nope'))).resolves.toBe(false)
  })
})
