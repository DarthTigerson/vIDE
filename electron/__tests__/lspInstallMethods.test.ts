import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { gzipSync } from 'zlib'
import { installServer, resolveServerBinary, type InstallDeps, type ResolveDeps } from '../lsp/installMethods'
import type { LanguageServerEntry } from '../lsp/catalog'

const base = { name: 'X', description: 'x', targets: ['vide'], languages: ['x'], args: ['--stdio'], versionArgs: ['--version'] }
const npm: LanguageServerEntry = { ...base, id: 'py', binary: 'pyright-langserver', install: { method: 'npm', packages: ['pyright'] } }
const go: LanguageServerEntry = { ...base, id: 'go', binary: 'gopls', install: { method: 'go', package: 'golang.org/x/tools/gopls@latest' } }
const gh: LanguageServerEntry = {
  ...base, id: 'rust', name: 'Rust', binary: 'rust-analyzer',
  install: { method: 'github-release', repo: 'rust-lang/rust-analyzer', format: 'gz', assets: { 'linux-x64': 'ra-linux.gz' } },
}

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lsp-install-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function installDeps(over: Partial<InstallDeps> = {}): InstallDeps {
  return {
    npmInstallGlobal: vi.fn(async () => {}),
    runStreamed: vi.fn(async () => {}),
    download: vi.fn(async () => gzipSync(Buffer.from('#!/bin/sh\necho ra\n'))),
    managedDir: dir,
    platform: () => 'linux-x64',
    ...over,
  }
}

describe('installServer', () => {
  it('npm: installs exactly the listed packages globally', async () => {
    const deps = installDeps()
    await installServer(npm, () => {}, deps)
    expect(deps.npmInstallGlobal).toHaveBeenCalledWith(['pyright'], expect.any(Function))
  })

  it('go: runs go install with the module path only', async () => {
    const deps = installDeps()
    await installServer(go, () => {}, deps)
    expect(deps.runStreamed).toHaveBeenCalledWith('go', ['install', 'golang.org/x/tools/gopls@latest'], expect.any(Function))
  })

  it('github-release: downloads this platform\'s asset and writes an executable binary', async () => {
    const deps = installDeps()
    await installServer(gh, () => {}, deps)
    expect(deps.download).toHaveBeenCalledWith('https://github.com/rust-lang/rust-analyzer/releases/latest/download/ra-linux.gz')
    const bin = join(dir, 'rust-analyzer')
    expect(readFileSync(bin, 'utf8')).toContain('echo ra')
    expect(statSync(bin).mode & 0o111).not.toBe(0)
  })

  it('github-release: fails clearly when no asset exists for this platform', async () => {
    const deps = installDeps({ platform: () => 'darwin-arm64' })
    await expect(installServer(gh, () => {}, deps)).rejects.toThrow(/No prebuilt Rust server/)
    expect(deps.download).not.toHaveBeenCalled()
  })
})

describe('resolveServerBinary', () => {
  const resolveDeps = (over: Partial<ResolveDeps> = {}): ResolveDeps => ({
    onPath: vi.fn(async () => null),
    npmBinary: vi.fn(async () => null),
    goBinary: vi.fn(async () => null),
    managedDir: dir,
    ...over,
  })

  it('npm looks where npm installs', async () => {
    const deps = resolveDeps({ npmBinary: vi.fn(async (n: string) => `/opt/npm/bin/${n}`) })
    expect(await resolveServerBinary(npm, deps)).toBe('/opt/npm/bin/pyright-langserver')
  })

  it('go falls back to GOPATH/bin', async () => {
    const deps = resolveDeps({ goBinary: vi.fn(async () => '/home/u/go/bin/gopls') })
    expect(await resolveServerBinary(go, deps)).toBe('/home/u/go/bin/gopls')
  })

  it('github-release falls back to the managed dir', async () => {
    expect(await resolveServerBinary(gh, resolveDeps())).toBeNull()
    writeFileSync(join(dir, 'rust-analyzer'), 'x')
    expect(await resolveServerBinary(gh, resolveDeps())).toBe(join(dir, 'rust-analyzer'))
  })

  it('never resolves a binary name that could reach the shell', async () => {
    const deps = resolveDeps({ onPath: vi.fn(async () => '/bin/sh') })
    expect(await resolveServerBinary({ ...go, binary: 'gopls;id' }, deps)).toBeNull()
    expect(deps.onPath).not.toHaveBeenCalled()
  })
})
