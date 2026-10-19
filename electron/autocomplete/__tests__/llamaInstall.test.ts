import { describe, it, expect, beforeEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MODEL_CATALOG } from '../catalog'
import { findInstalledLlamaServer, findModelOnDisk, installLlama } from '../llamaInstall'

let root: string
let archive: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vide-llama-'))
  // A tarball shaped like the real release: one top-level llama-b11707/ dir.
  const src = mkdtempSync(join(tmpdir(), 'vide-llama-src-'))
  mkdirSync(join(src, 'llama-b11707'))
  writeFileSync(join(src, 'llama-b11707', 'llama-server'), '#!/bin/sh\n')
  chmodSync(join(src, 'llama-b11707', 'llama-server'), 0o755)
  writeFileSync(join(src, 'llama-b11707', 'libggml.dylib'), '')
  archive = join(src, 'release.tar.gz')
  execFileSync('tar', ['czf', archive, '-C', src, 'llama-b11707'])
})

const fakeDownload = async (_url: string, dest: string) => { copyFileSync(archive, dest) }

describe('installLlama', () => {
  it('downloads and extracts the pinned build and returns the llama-server path', async () => {
    const path = await installLlama(root, { download: fakeDownload })
    expect(path.endsWith('/llama-server')).toBe(true)
    expect(existsSync(path)).toBe(true)
    expect(existsSync(join(root, 'b11707.tar.gz'))).toBe(false)
  })

  it('is found again by findInstalledLlamaServer', async () => {
    const path = await installLlama(root, { download: fakeDownload })
    expect(await findInstalledLlamaServer(root)).toBe(path)
  })
})

describe('findInstalledLlamaServer', () => {
  it('returns null before anything is installed', async () => {
    expect(await findInstalledLlamaServer(root)).toBeNull()
  })
})

describe('findModelOnDisk', () => {
  const model = MODEL_CATALOG['qwen-1.5b']

  it("matches llama.cpp's -hf cache file name when the size matches", async () => {
    const file = join(root, `ggml-org_Qwen2.5-Coder-1.5B-Q8_0-GGUF_${model.fileName}`)
    writeFileSync(file, '')
    truncateSync(file, model.bytes)
    expect(await findModelOnDisk(model, [root])).toBe(file)
  })

  it('matches the plain file name one level down', async () => {
    mkdirSync(join(root, 'sub'))
    const file = join(root, 'sub', model.fileName)
    writeFileSync(file, '')
    truncateSync(file, model.bytes)
    expect(await findModelOnDisk(model, [join(tmpdir(), 'does-not-exist'), root])).toBe(file)
  })

  it('ignores a file of the wrong size (a partial or different quant)', async () => {
    const file = join(root, model.fileName)
    writeFileSync(file, 'short')
    expect(await findModelOnDisk(model, [root])).toBeNull()
  })
})
