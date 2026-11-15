import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createRequire } from 'module'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, BrowserWindow: {}, dialog: {}, app: {} }))

import { parseManifest } from '../appManifest'
import { createMainVideApi } from '../mainVideApi'
import { AppHost } from '../appHost'
import { writeInstalled } from '../installedApps'
import type { AppInstaller } from '../appInstaller'

const base = { id: 'ddg', name: 'DuckDuckGo', version: '1.0.0', apiVersion: 1, minVide: '0.3.3', renderer: 'renderer.js' }
const schema = { type: 'object', properties: {} }
const tool = (name: string) => ({ name, description: `${name} desc`, inputSchema: schema })

describe('manifest agentTools', () => {
  const parse = (agentTools: unknown) => parseManifest({ ...base, contributes: {}, agentTools }) as any

  it('parses a valid block', () => {
    const m = parse({ instructions: 'Use it.', tools: [tool('web_search')] })
    expect(m.agentTools).toEqual({ instructions: 'Use it.', tools: [tool('web_search')] })
  })
  it('drops a bad name, empty description, or missing schema; keeps the rest', () => {
    const m = parse({
      tools: [
        tool('Bad-Name'),
        { name: 'nodesc', description: ' ', inputSchema: schema },
        { name: 'noschema', description: 'x' },
        { name: 'wrongtype', description: 'x', inputSchema: { type: 'string' } },
        tool('good'),
        tool('good')
      ]
    })
    expect(m.agentTools.tools.map((t: any) => t.name)).toEqual(['good'])
  })
  it('caps at 32 tools', () => {
    const tools = Array.from({ length: 40 }, (_, i) => tool(`t${i}`))
    expect(parse({ tools }).agentTools.tools).toHaveLength(32)
  })
  it('ignores a malformed block or one with no valid tools; old contributes boolean still parses', () => {
    expect(parse('nope').agentTools).toBeUndefined()
    expect(parse({ tools: [tool('BAD')] }).agentTools).toBeUndefined()
    const m = parseManifest({ ...base, contributes: { agentTools: true } }) as any
    expect(m.contributes.agentTools).toBe(true)
    expect(m.agentTools).toBeUndefined()
  })
})

describe('vide.agentTools.handle', () => {
  it('accepts declared names, rejects undeclared, unsubscribe removes', () => {
    const toolHandlers = new Map<string, Function>()
    const api = createMainVideApi('ddg', {
      handlers: new Map(), emit: vi.fn(), closeListeners: new Set(),
      declaredTools: [tool('web_search')], toolHandlers: toolHandlers as never
    })
    const off = api.agentTools.handle('web_search', () => 'x')
    expect(toolHandlers.has('web_search')).toBe(true)
    expect(() => api.agentTools.handle('other', () => 'x')).toThrow(/not declared/)
    off()
    expect(toolHandlers.has('web_search')).toBe(false)
  })
})

describe('AppHost agent tools', () => {
  let dir: string
  const nodeRequire = createRequire(import.meta.url)
  const requireFresh = (p: string) => { delete nodeRequire.cache[nodeRequire.resolve(p)]; return nodeRequire(p) }

  function install(id: string, name: string, tools: string[], main: string) {
    const root = join(dir, id, '1.0.0')
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'manifest.json'), JSON.stringify({
      ...base, id, name, main: 'main.js', contributes: {},
      agentTools: { instructions: `${name} says hi`, tools: tools.map(tool) }
    }))
    writeFileSync(join(root, 'renderer.js'), '')
    writeFileSync(join(root, 'main.js'), main)
  }
  const rec = (id: string, disabled = false) => ({ id, version: '1.0.0', commit: 'a'.repeat(40), installedAt: 1, ...(disabled ? { disabled: true as const } : {}) })
  const make = (reserved: string[] = []) =>
    new AppHost({
      appsDir: dir,
      installer: { installDir: (id: string, v: string) => join(dir, id, v) } as unknown as AppInstaller,
      getListing: async () => null, isDev: false, currentVersion: '0.4.0',
      broadcast: vi.fn() as never, sendTo: vi.fn() as never, requireFn: requireFresh,
      reservedToolNames: () => reserved
    })

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'agenttools-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('lists tools for enabled apps; list() exposes them for disabled too', async () => {
    install('a', 'A', ['one'], '')
    install('b', 'B', ['two'], '')
    writeInstalled(dir, [rec('a'), rec('b', true)])
    const host = make()
    await host.start()
    const groups = host.agentToolList()
    expect(groups.map((g) => g.appId)).toEqual(['a'])
    expect(groups[0]).toMatchObject({ appName: 'A', instructions: 'A says hi' })
    expect(host.list().find((a) => a.id === 'b')?.agentTools).toEqual([{ name: 'two', description: 'two desc' }])
  })

  it('skips names reserved by built-ins or taken by an earlier app (ordered by id)', async () => {
    install('b', 'B', ['dup', 'mine'], '')
    install('a', 'A', ['dup', 'web_search'], '')
    writeInstalled(dir, [rec('b'), rec('a')])
    const host = make(['web_search'])
    await host.start()
    const groups = host.agentToolList()
    expect(groups.map((g) => [g.appId, g.tools.map((t) => t.name)])).toEqual([['a', ['dup']], ['b', ['mine']]])
  })

  it('callAgentTool: ok (string and {text}), ctx windowId, throw, missing handler, undeclared', async () => {
    install('a', 'Alpha', ['ok', 'obj', 'boom', 'silent'], `
      exports.activate = (vide) => {
        vide.agentTools.handle('ok', (args, ctx) => 'hi ' + args.q + ' ' + ctx.windowId)
        vide.agentTools.handle('obj', async () => ({ text: 'obj' }))
        vide.agentTools.handle('boom', () => { throw new Error('kaput') })
      }`)
    writeInstalled(dir, [rec('a')])
    const host = make()
    await host.start()
    expect(await host.callAgentTool('ok', { q: 'x' }, 7)).toBe('hi x 7')
    expect(await host.callAgentTool('obj', {}, 7)).toBe('obj')
    await expect(host.callAgentTool('boom', {}, 7)).rejects.toThrow('kaput')
    await expect(host.callAgentTool('silent', {}, 7)).rejects.toThrow('Alpha did not register silent')
    await expect(host.callAgentTool('nope', {}, 7)).rejects.toThrow(/Unknown tool/)
  })

  it('callAgentTool times out after 60s', async () => {
    install('a', 'A', ['slow'], `exports.activate = (vide) => { vide.agentTools.handle('slow', () => new Promise(() => {})) }`)
    writeInstalled(dir, [rec('a')])
    const host = make()
    await host.start()
    vi.useFakeTimers()
    try {
      const p = host.callAgentTool('slow', {}, 1)
      const assertion = expect(p).rejects.toThrow(/60s/)
      await vi.advanceTimersByTimeAsync(60_001)
      await assertion
    } finally { vi.useRealTimers() }
  })
})
