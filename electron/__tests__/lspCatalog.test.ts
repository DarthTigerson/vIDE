import { describe, it, expect, vi } from 'vitest'
import { parseLanguageServer, parseLanguageServers } from '../lsp/catalog'
import { installSourceText } from '../../src/lib/lspInstallSource'
import { parseRegistry } from '../storeRegistry'

vi.spyOn(console, 'warn').mockImplementation(() => {})

const npmEntry = {
  id: 'typescript',
  name: 'TypeScript / JavaScript',
  description: 'typescript-language-server.',
  languages: ['typescript', 'javascript'],
  binary: 'typescript-language-server',
  args: ['--stdio'],
  install: { method: 'npm', packages: ['typescript-language-server', 'typescript'] },
}
const goEntry = {
  id: 'go', name: 'Go', description: 'gopls.', targets: ['vide'], languages: ['go'], binary: 'gopls',
  versionArgs: ['version'], install: { method: 'go', package: 'golang.org/x/tools/gopls@latest' },
}
const rustEntry = {
  id: 'rust', name: 'Rust', description: 'rust-analyzer.', languages: ['rust'], binary: 'rust-analyzer',
  install: {
    method: 'github-release', repo: 'rust-lang/rust-analyzer', format: 'gz',
    assets: { 'darwin-arm64': 'rust-analyzer-aarch64-apple-darwin.gz', 'linux-x64': 'rust-analyzer-x86_64-unknown-linux-gnu.gz' },
  },
}

describe('parseLanguageServer', () => {
  it('accepts all three install methods and fills defaults', () => {
    const ts = parseLanguageServer(npmEntry)
    expect(ts).toMatchObject({ id: 'typescript', targets: ['vide'], versionArgs: ['--version'], args: ['--stdio'] })
    expect(parseLanguageServer(goEntry)).toMatchObject({ install: { method: 'go' }, args: [], versionArgs: ['version'] })
    expect(parseLanguageServer(rustEntry)).toMatchObject({ install: { method: 'github-release', format: 'gz' } })
  })

  it.each([
    ['binary with a shell metacharacter', { ...npmEntry, binary: 'tsls; rm -rf ~' }],
    ['binary starting with a dash', { ...npmEntry, binary: '-x' }],
    ['npm package that is a flag', { ...npmEntry, install: { method: 'npm', packages: ['--prefix=/'] } }],
    ['npm package with a space', { ...npmEntry, install: { method: 'npm', packages: ['a b'] } }],
    ['no npm packages', { ...npmEntry, install: { method: 'npm', packages: [] } }],
    ['go package without a version', { ...goEntry, install: { method: 'go', package: 'golang.org/x/tools/gopls' } }],
    ['unknown method', { ...npmEntry, install: { method: 'shell', command: 'curl x | sh' } }],
    ['unknown platform', { ...rustEntry, install: { ...rustEntry.install, assets: { 'win-x64': 'a.gz' } } }],
    ['asset with a slash', { ...rustEntry, install: { ...rustEntry.install, assets: { 'linux-x64': '../a.gz' } } }],
    ['format other than gz', { ...rustEntry, install: { ...rustEntry.install, format: 'tar.gz' } }],
    ['arg with a space', { ...npmEntry, args: ['--stdio x'] }],
    ['no languages', { ...npmEntry, languages: [] }],
    ['bad id', { ...npmEntry, id: 'Type Script' }],
  ])('rejects %s', (_name, raw) => {
    expect(typeof parseLanguageServer(raw)).toBe('string')
  })

  it('drops a bad optional field, keeping the entry', () => {
    const parsed = parseLanguageServer({ ...npmEntry, homepage: 'http://insecure', ramEstimate: 42 })
    expect(typeof parsed).toBe('object')
    expect(parsed).not.toHaveProperty('homepage')
    expect(parsed).not.toHaveProperty('ramEstimate')
  })
})

describe('parseLanguageServers', () => {
  it('drops bad and duplicate entries alone and keeps only vIDE targets', () => {
    const list = parseLanguageServers([
      npmEntry,
      { ...npmEntry, binary: 'bad binary' },
      { ...goEntry, id: 'typescript' },
      { ...goEntry, targets: ['vcad'] },
      rustEntry,
    ])
    expect(list.map((e) => e.id)).toEqual(['rust', 'typescript'])
  })

  it('treats a missing list as none', () => {
    expect(parseLanguageServers(undefined)).toEqual([])
  })
})

describe('parseRegistry with languageServers', () => {
  it('returns them next to apps', () => {
    const parsed = parseRegistry({ schema: 1, apps: [], languageServers: [goEntry] })
    expect(parsed).toMatchObject({ kind: 'ok', apps: [], languageServers: [{ id: 'go' }] })
  })

  it('a registry without the key still parses', () => {
    expect(parseRegistry({ schema: 1, apps: [] })).toMatchObject({ kind: 'ok', languageServers: [] })
  })
})

describe('installSourceText', () => {
  it('shows the exact source per method', () => {
    expect(installSourceText({ method: 'npm', packages: ['pyright'] })).toBe('npm install -g pyright')
    expect(installSourceText({ method: 'go', package: 'golang.org/x/tools/gopls@latest' })).toBe('go install golang.org/x/tools/gopls@latest')
    expect(installSourceText({ method: 'github-release', repo: 'rust-lang/rust-analyzer', format: 'gz', assets: {} }))
      .toBe('Download from github.com/rust-lang/rust-analyzer releases')
  })
})

describe('display-only author and version', () => {
  const base = {
    id: 'go', name: 'Go', description: 'gopls.', languages: ['go'], binary: 'gopls',
    install: { method: 'go', package: 'golang.org/x/tools/gopls@latest' },
  }
  it('keeps good ones and drops bad ones without dropping the entry', () => {
    const ok = parseLanguageServer({ ...base, author: 'The Go team', version: 'v0.24.0' })
    expect(ok).toMatchObject({ author: 'The Go team', version: 'v0.24.0' })
    const bad = parseLanguageServer({ ...base, author: 'x'.repeat(61), version: '<b>' })
    expect(typeof bad).toBe('object')
    expect(bad).not.toHaveProperty('author')
    expect(bad).not.toHaveProperty('version')
  })
})

