import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, statSync, readFileSync, rmSync } from 'fs'
import { createServer, request, type Server } from 'http'
import type { AddressInfo } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'
import { VcloakManager } from '../index'
import { VcloakStore, validateConfig, type Sealer } from '../store'
import { discoverRepos, originUrl, remotePath } from '../sources'
import { DEFAULT_VCLOAK_CONFIG } from '../types'
import { TOKEN_HEADER } from '../gateway'

// Reversible stand-in for safeStorage
const sealer = (available = true): Sealer => ({
  available: () => available,
  seal: (s) => Buffer.from('SEALED:' + Buffer.from(s).toString('base64')),
  open: (b) => {
    const t = b.toString()
    if (!t.startsWith('SEALED:')) throw new Error('bad')
    return Buffer.from(t.slice(7), 'base64').toString()
  },
})

let tmp: string
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'vcloak-')) })
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

function fakeRepo(ws: string, rel: string, url: string) {
  mkdirSync(join(ws, rel, '.git'), { recursive: true })
  writeFileSync(join(ws, rel, '.git', 'config'), `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`)
}

describe('vCloak store', () => {
  it('seals files with owner-only permissions', () => {
    const store = new VcloakStore(join(tmp, 'vc'), sealer())
    store.saveConfig({ ...DEFAULT_VCLOAK_CONFIG, root: 'acme-corp' })
    const file = join(tmp, 'vc', 'config.bin')
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(statSync(join(tmp, 'vc')).mode & 0o777).toBe(0o700)
    expect(readFileSync(file, 'utf8')).not.toContain('acme-corp')
    expect(store.loadConfig().config.root).toBe('acme-corp')
  })

  it('treats a tampered config as an error that keeps vCloak locked on', () => {
    const store = new VcloakStore(join(tmp, 'vc'), sealer())
    store.saveConfig({ ...DEFAULT_VCLOAK_CONFIG, root: 'acme-corp', enabled: true })
    writeFileSync(join(tmp, 'vc', 'config.bin'), JSON.stringify({ enabled: false }))
    const { config, error } = store.loadConfig()
    expect(error).toMatch(/could not open/)
    expect(config.enabled).toBe(true)
    expect(config.failClosed).toBe(true)
  })

  it('validates paths and decoys', () => {
    const base = { ...DEFAULT_VCLOAK_CONFIG, root: 'acme-corp' }
    expect(validateConfig({ ...base, enabled: true, root: '' })).toMatch(/company root/)
    expect(validateConfig({ ...base, root: 'bad root!' })).toMatch(/Company root/)
    const hid = { ...base, hiddenFolders: ['/Users/you/Documents/proj'] }
    expect(validateConfig({ ...hid, hiddenDecoys: { '/Users/you/Documents/proj': '/Users/you/Documents/acme-corp' } }, [], '/Users/you')).toBeNull()
    expect(validateConfig({ ...hid, hiddenDecoys: { '/Users/you/Documents/proj': '/Users/you/Documents/proj/x' } }, [], '/Users/you')).toMatch(/overlaps/)
    expect(validateConfig({ ...hid, hiddenDecoys: { '/Users/you/Documents/proj': '/Users/you/Documents/proj-x' } }, [], '/Users/you')).toMatch(/too similar/)
    expect(validateConfig({ ...hid, hiddenDecoys: { '/Users/you/Documents/proj': '/opt/acme' } }, [], '/Users/you')).toMatch(/inside your home folder/)
    expect(validateConfig({ ...hid, hiddenDecoys: { '/Users/you/Documents/other': '/Users/you/x' } }, [], '/Users/you')).toMatch(/not a hidden folder/)
    expect(validateConfig({ ...base, exceptions: ['other/x'] })).toMatch(/under acme-corp/)
    expect(validateConfig({ ...base, rules: [{ real: 'acme-corp/a', decoy: 'acme-corp/a/b' }] })).toMatch(/clashes/)
    expect(validateConfig({ ...base, rules: [{ real: 'acme-corp/a', decoy: 'acme-corp/z' }] }, ['acme-corp/z/repo'])).toMatch(/clashes/)
    expect(validateConfig({ ...base, rules: [{ real: 'acme-corp/a', decoy: 'acme-corp/z' }, { real: 'acme-corp/b', decoy: 'acme-corp/z' }] })).toMatch(/twice/)
    expect(validateConfig({ ...base, rules: [{ real: 'acme-corp/a', decoy: 'acme-corp/z' }] })).toBeNull()
  })

  it('validates hidden folders', () => {
    const base = { ...DEFAULT_VCLOAK_CONFIG, root: 'acme-corp' }
    const bad = (hiddenFolders: string[], home?: string) => validateConfig({ ...base, hiddenFolders }, [], home)
    expect(bad(['/Users/you/Documents'])).toBeNull()
    expect(bad(['/Users/you/Documents', '/Users/you/Work'])).toBeNull()
    expect(bad(['Documents'])).toMatch(/absolute/)
    expect(bad(['~/Documents'])).toMatch(/absolute/)
    expect(bad(['/Users/you/Documents/'])).toMatch(/clean path/)
    expect(bad(['/Users/you/../Documents'])).toMatch(/clean path/)
    expect(bad(['/Users/you//Documents'])).toMatch(/clean path/)
    expect(bad(['/'])).toMatch(/too broad/)
    expect(bad(['/Users'])).toMatch(/too broad/)
    expect(bad(['/Users/you'])).toMatch(/too broad/)
    expect(bad(['/Users/you/Documents'], '/Users/you/Documents')).toMatch(/too broad/)
    expect(bad(['/Users/you'], '/Users/you')).toMatch(/too broad/)
    expect(bad(['/Users/you/My Docs'])).toMatch(/spaces/)
    expect(bad(['/Users/you/Documents', '/Users/you/Documents'])).toMatch(/twice/)
    expect(bad(['/Users/you/Documents', '/Users/you/Documents/work'])).toMatch(/overlap/)
    expect(bad(Array.from({ length: 51 }, (_, i) => `/Users/you/d${i}`))).toMatch(/At most 50/)
    expect(validateConfig({ ...base, hiddenFolders: 'x' as unknown as string[] })).toMatch(/Invalid hidden/)
  })

  it('only needs a root or a hidden folder to turn on', () => {
    const base = { ...DEFAULT_VCLOAK_CONFIG, enabled: true, root: '' }
    expect(validateConfig(base)).toBe('Enter a company root or a hidden local folder before turning vCloak on')
    expect(validateConfig({ ...base, hiddenFolders: ['/Users/you/Documents'] })).toBeNull()
    expect(validateConfig({ ...base, root: 'acme-corp' })).toBeNull()
  })
})

describe('vCloak sources', () => {
  it('parses remotes', () => {
    expect(remotePath('git@gitlab.com:acme-corp/a/b.git')).toBe('acme-corp/a/b')
    expect(remotePath('https://gitlab.com/acme-corp/a/b')).toBe('acme-corp/a/b')
    expect(remotePath('ssh://git@gitlab.com:22/acme-corp/a/b.git')).toBe('acme-corp/a/b')
    expect(originUrl('[remote "upstream"]\n\turl = u1\n[remote "origin"]\n\turl = u2\n')).toBe('u2')
  })

  it('finds company repos from graphify and ripgrep, ignoring others', async () => {
    const ws = join(tmp, 'ws')
    fakeRepo(ws, 'platform/billing/api', 'git@gitlab.com:acme-corp/platform/billing/api.git')
    fakeRepo(ws, 'deploy-config', 'https://gitlab.com/acme-corp/infra/deploy-config.git')
    fakeRepo(ws, 'vendor/lib', 'https://github.com/someone/lib.git')
    mkdirSync(join(ws, 'graphify-out'))
    writeFileSync(join(ws, 'graphify-out', 'manifest.json'), JSON.stringify({ 'platform/billing/api/main.go': {}, 'vendor/lib/x.js': {} }))
    const { rgPath } = await import('@vscode/ripgrep')
    const r = await discoverRepos(ws, 'acme-corp', rgPath)
    expect(r.graphify).toMatchObject({ found: true, repos: 1 })
    expect(r.ripgrep.repos).toBe(2)
    expect(r.repos.map((x) => x.rel).sort()).toEqual(['deploy-config', 'platform/billing/api'])
  })
})

describe('vCloak manager', () => {
  let upstream: Server
  let seenBody = ''

  beforeEach(async () => {
    upstream = createServer((req, res) => {
      let b = ''
      req.on('data', (c) => (b += c))
      req.on('end', () => {
        seenBody = b
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(b) // echo: the model "repeats" the masked prompt
      })
    })
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', () => r()))
  })
  afterEach(async () => { await new Promise<void>((r) => upstream.close(() => r())) })

  function manager(available = true) {
    return new VcloakManager({
      dir: join(tmp, 'state'),
      sealer: sealer(available),
      rgPath: async () => (await import('@vscode/ripgrep')).rgPath,
      homeDir: '/Users/kf',
      username: 'kf',
      upstream: `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`,
    })
  }

  it('does nothing to sessions while off', async () => {
    const m = manager()
    expect(await m.prepareSpawn(tmp)).toBeNull()
    await m.dispose()
  })

  it('refuses to turn on without the keychain', async () => {
    const m = manager(false)
    const r = await m.setConfig({ enabled: true, root: 'acme-corp' })
    expect(r).toMatchObject({ ok: false })
    await m.dispose()
  })

  it('masks a real session request end to end and restores the reply', async () => {
    const ws = join(tmp, 'ws')
    fakeRepo(ws, 'platform/billing', 'git@gitlab.com:acme-corp/platform/billing.git')
    const m = manager()
    expect(await m.setConfig({ enabled: true, root: 'acme-corp' })).toMatchObject({ ok: true })
    const spawn = await m.prepareSpawn(ws)
    expect(spawn).toMatchObject({ ok: true })
    if (!spawn || !spawn.ok) throw new Error('no spawn')
    const url = new URL(spawn.url)
    const token = spawn.headers.split(': ')[1]
    const prompt = `edit ${ws}/platform/billing/kustomization.yaml in acme-corp/platform/billing`
    const reply = await new Promise<string>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: url.port, path: '/v1/messages', method: 'POST', headers: { host: url.host, 'content-type': 'application/json', [TOKEN_HEADER]: token } }, (res) => {
        let d = ''
        res.on('data', (c) => (d += c))
        res.on('end', () => resolve(d))
      })
      req.on('error', reject)
      req.end(JSON.stringify({ messages: [{ role: 'user', content: prompt }] }))
    })
    expect(seenBody).not.toContain('platform')
    expect(seenBody).not.toContain('billing')
    expect(JSON.parse(reply).messages[0].content).toBe(prompt)
    expect(m.state().stats.requests).toBe(1)
    const rows = m.listRepos()
    expect(rows).toEqual([expect.objectContaining({ remote: 'acme-corp/platform/billing', cloaked: true })])
    await m.dispose()
  })

  it('blocks sessions after the stored settings were tampered with', async () => {
    const m1 = manager()
    await m1.setConfig({ enabled: true, root: 'acme-corp' })
    await m1.dispose()
    writeFileSync(join(tmp, 'state', 'config.bin'), 'garbage')
    const m2 = manager()
    expect(await m2.prepareSpawn(tmp)).toMatchObject({ ok: false })
    expect(await m2.setConfig({ enabled: true, root: 'acme-corp' })).toMatchObject({ ok: true })
    expect(await m2.prepareSpawn(tmp)).toMatchObject({ ok: true })
    await m2.dispose()
  })

  it('previews masking and generates clash-free decoys', async () => {
    const m = manager()
    await m.setConfig({ root: 'acme-corp' })
    const p = m.preview('see acme-corp/a/b')
    expect(p.masked).not.toContain('a/b')
    expect(p.restored).toBe('see acme-corp/a/b')
    expect(m.generateDecoy('acme-corp/a/b')).toMatch(/^acme-corp\/[a-z]+\/[a-z]+$/)
    await m.dispose()
  })
  it('normalises pasted input before saving', async () => {
    const ws = join(tmp, 'ws')
    fakeRepo(ws, 'platform/billing', 'git@gitlab.com:acme-corp/platform/billing.git')
    const m = manager()
    expect(await m.setConfig({ root: 'https://gitlab.com/acme-corp/' })).toMatchObject({ ok: true })
    expect(m.state().config.root).toBe('acme-corp')
    await m.registerWorkspace(ws)
    const r = await m.setConfig({
      mode: 'all-except',
      exceptions: ['https://gitlab.com/acme-corp/ops/docs/-/tree/main', 'core/x', `${ws}/platform/billing/`],
    })
    expect(r).toMatchObject({ ok: true })
    expect(m.state().config.exceptions).toEqual(['acme-corp/ops/docs', 'acme-corp/core/x', 'acme-corp/platform/billing'])
    const bad = await m.setConfig({ exceptions: [`${tmp}/nowhere`] })
    expect(bad).toEqual({ ok: false, error: `No git repository found at ${tmp}/nowhere. To hide a local folder, add it under Hidden local folders.` })
    await m.dispose()
  })

  it('hides folders with no company root, using the real disk', async () => {
    const hid = join(tmp, 'hid')
    mkdirSync(join(hid, 'my_proj', '.git'), { recursive: true })
    mkdirSync(join(hid, 'plain', 'inner'), { recursive: true })
    const m = manager()
    expect(await m.setConfig({ enabled: true, hiddenFolders: [hid + '/'] })).toMatchObject({ ok: true })
    expect(m.state().config.hiddenFolders).toEqual([hid])
    const abs = `${hid}/my_proj/src/a.ts and ${hid}/plain/inner/b.md`
    const p = m.preview(abs)
    expect(p.masked).not.toMatch(/my_proj|plain|inner/)
    expect(p.masked).toContain('/src/a.ts')
    expect(p.masked).toContain('/b.md')
    expect(p.restored).toBe(abs)
    const enc = hid.replace(/[^A-Za-z0-9]/g, '-')
    const dashed = `x/${enc}-my-proj/memory`
    const d = m.preview(dashed)
    expect(d.masked).not.toMatch(/my-proj/)
    expect(d.restored).toBe(dashed)
    expect(await m.setConfig({ hiddenFolders: ['/Users/kf'] })).toMatchObject({ ok: false })
    expect(await m.setConfig({ hiddenFolders: ['~/Documents'] })).toMatchObject({ ok: true })
    expect(m.state().config.hiddenFolders).toEqual(['/Users/kf/Documents'])
    expect(await m.setConfig({ hiddenFolders: [] })).toMatchObject({ ok: false })
    await m.dispose()
  })
})
