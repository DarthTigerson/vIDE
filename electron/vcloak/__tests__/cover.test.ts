import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, statSync, readFileSync, rmSync } from 'fs'
import { spawnSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { VcloakManager } from '../index'
import type { Sealer } from '../store'

const sealer = (available: boolean | (() => boolean) = true): Sealer => ({
  available: typeof available === 'function' ? available : () => available,
  seal: (s) => Buffer.from('SEALED:' + Buffer.from(s).toString('base64')),
  open: (b) => {
    const t = b.toString()
    if (!t.startsWith('SEALED:')) throw new Error('bad')
    return Buffer.from(t.slice(7), 'base64').toString()
  },
})

let tmp: string
let managers: VcloakManager[]
const savedEnv = { base: process.env.OPENAI_BASE_URL, path: process.env.PATH }

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'vcloak-cover-'))
  managers = []
})
afterEach(async () => {
  for (const m of managers) await m.dispose()
  if (savedEnv.base === undefined) delete process.env.OPENAI_BASE_URL
  else process.env.OPENAI_BASE_URL = savedEnv.base
  process.env.PATH = savedEnv.path
  rmSync(tmp, { recursive: true, force: true })
})

function manager(available: boolean | (() => boolean) = true, dir = join(tmp, 'state')) {
  const m = new VcloakManager({
    dir,
    sealer: sealer(available),
    rgPath: async () => (await import('@vscode/ripgrep')).rgPath,
    homeDir: '/Users/you',
    username: 'you',
    upstream: 'http://127.0.0.1:9',
  })
  managers.push(m)
  return m
}

const ROOTS = [{ path: 'acme-corp', host: 'gitlab' as const }]

describe('vCloak forBridge', () => {
  it('returns null while disabled', async () => {
    const m = manager()
    expect(await m.forBridge()).toBeNull()
  })

  it('returns null when coverBridge is off', async () => {
    const m = manager()
    expect(await m.setConfig({ enabled: true, roots: ROOTS, coverBridge: false })).toMatchObject({ ok: true })
    expect(await m.forBridge()).toBeNull()
  })

  it('returns a working cloak when enabled', async () => {
    const m = manager()
    expect(await m.setConfig({ enabled: true, roots: ROOTS, hiddenFolders: [tmp] })).toMatchObject({ ok: true })
    const r = await m.forBridge()
    expect(r).toMatchObject({ ok: true })
    if (!r || !r.ok) throw new Error('no cloak')
    const real = `${tmp}/secret-proj/src/a.ts`
    const body = { messages: [{ role: 'user', content: `open ${real}` }] }
    const masked = r.cloak.maskBody(body)
    expect(JSON.stringify(masked)).not.toContain('secret-proj')
    const text = (masked.messages[0] as { content: string }).content
    expect(r.cloak.unmaskText(text)).toBe(`open ${real}`)
    expect(m.state().stats.requests).toBe(1)
  })

  it('blocks when fail closed and the Keychain is unavailable', async () => {
    let up = true
    const m = manager(() => up)
    await m.setConfig({ enabled: true, roots: ROOTS })
    up = false
    expect(await m.forBridge()).toMatchObject({ ok: false, error: expect.stringContaining('Keychain') })
  })

  it('sends as is when the Keychain is unavailable and fail closed is off', async () => {
    let up = true
    const m = manager(() => up)
    await m.setConfig({ enabled: true, roots: ROOTS, failClosed: false })
    up = false
    expect(await m.forBridge()).toBeNull()
  })

  it('blocks when fail closed and the stored settings fail to load', async () => {
    const m1 = manager()
    await m1.setConfig({ enabled: true, roots: ROOTS })
    await m1.dispose()
    writeFileSync(join(tmp, 'state', 'config.bin'), 'garbage')
    const m2 = manager()
    expect(await m2.forBridge()).toMatchObject({ ok: false })
  })
})

describe('vCloak terminalEnv', () => {
  const URL_RE = (route: string) => new RegExp(`^http://127\\.0\\.0\\.1:\\d+/t/[0-9a-f]{64}/${route}$`)

  it('is empty while disabled', async () => {
    const m = manager()
    await m.init()
    expect(m.terminalEnv()).toEqual({})
  })

  it('is empty before the gateway listens', async () => {
    const m = manager()
    await m.setConfig({ enabled: true, roots: ROOTS })
    await m.dispose()
    const m2 = manager()
    expect(m2.terminalEnv()).toEqual({})
  })

  it('is empty when coverTerminals is off', async () => {
    const m = manager()
    await m.setConfig({ enabled: true, roots: ROOTS, coverTerminals: false })
    expect(m.terminalEnv()).toEqual({})
  })

  it('returns route URLs, the wrapper PATH and the Codex URL when enabled', async () => {
    delete process.env.OPENAI_BASE_URL
    process.env.PATH = '/usr/bin:/bin'
    const m = manager()
    await m.init()
    await m.setConfig({ enabled: true, roots: ROOTS })
    const env = m.terminalEnv()
    expect(env.VIDE_VCLOAK).toBe('1')
    expect(env.ANTHROPIC_BASE_URL).toMatch(URL_RE('anthropic'))
    expect(env.CODE_ASSIST_ENDPOINT).toMatch(URL_RE('codeassist'))
    expect(env.OPENAI_BASE_URL).toMatch(new RegExp(URL_RE('openai').source.replace('$', '/v1$')))
    expect(env.VIDE_VCLOAK_OPENAI_URL).toBe(env.OPENAI_BASE_URL)
    expect(env.PATH).toBe(`${join(tmp, 'state', 'bin')}:/usr/bin:/bin`)
  })

  it('leaves a pre-set OPENAI_BASE_URL alone', async () => {
    process.env.OPENAI_BASE_URL = 'https://openrouter.example/v1'
    const m = manager()
    await m.init()
    await m.setConfig({ enabled: true, roots: ROOTS })
    expect(m.terminalEnv()).not.toHaveProperty('OPENAI_BASE_URL')
  })

  it('skips the Codex wrapper when coverCodex is off', async () => {
    const m = manager()
    await m.init()
    await m.setConfig({ enabled: true, roots: ROOTS, coverCodex: false })
    const env = m.terminalEnv()
    expect(env.ANTHROPIC_BASE_URL).toBeDefined()
    expect(env).not.toHaveProperty('PATH')
    expect(env).not.toHaveProperty('VIDE_VCLOAK_OPENAI_URL')
  })

  it('skips the Codex wrapper when it does not exist', async () => {
    const m = manager()
    await m.setConfig({ enabled: true, roots: ROOTS })
    rmSync(join(tmp, 'state', 'bin'), { recursive: true, force: true })
    const env = m.terminalEnv()
    expect(env.ANTHROPIC_BASE_URL).toBeDefined()
    expect(env).not.toHaveProperty('PATH')
    expect(env).not.toHaveProperty('VIDE_VCLOAK_OPENAI_URL')
  })
})

describe('Codex wrapper', () => {
  async function wrapperDir() {
    const m = manager()
    await m.init()
    return join(tmp, 'state', 'bin')
  }

  function fakeCodex(): string {
    const dir = join(tmp, 'fake')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'codex')
    writeFileSync(file, '#!/bin/sh\nfor a in "$@"; do echo "ARG:$a"; done\n')
    chmodSync(file, 0o755)
    return dir
  }

  const run = (bin: string, pathDirs: string[], env: Record<string, string>, args: string[]) =>
    spawnSync('/bin/sh', [join(bin, 'codex'), ...args], {
      encoding: 'utf8',
      env: { PATH: pathDirs.join(':'), ...env },
    })

  it('is written with owner-only permissions and the override variable', async () => {
    const bin = await wrapperDir()
    expect(statSync(join(bin, 'codex')).mode & 0o777).toBe(0o700)
    expect(readFileSync(join(bin, 'codex'), 'utf8')).toContain('VIDE_VCLOAK_OPENAI_URL')
  })

  it('passes the base URL override before the user args', async () => {
    const bin = await wrapperDir()
    const r = run(bin, [bin, fakeCodex(), '/usr/bin', '/bin'], { VIDE_VCLOAK_OPENAI_URL: 'http://x/v1' }, ['exec', 'hi there'])
    expect(r.status).toBe(0)
    expect(r.stdout.trim().split('\n')).toEqual(['ARG:-c', 'ARG:openai_base_url="http://x/v1"', 'ARG:exec', 'ARG:hi there'])
  })

  it('passes only the user args without the variable', async () => {
    const bin = await wrapperDir()
    const r = run(bin, [bin, fakeCodex(), '/usr/bin', '/bin'], {}, ['exec', 'hi'])
    expect(r.status).toBe(0)
    expect(r.stdout.trim().split('\n')).toEqual(['ARG:exec', 'ARG:hi'])
  })

  it('exits 127 when there is no real codex', async () => {
    const bin = await wrapperDir()
    const r = run(bin, [bin, '/usr/bin', '/bin'], {}, ['x'])
    expect(r.status).toBe(127)
    expect(r.stderr).toContain('command not found')
  })
})
