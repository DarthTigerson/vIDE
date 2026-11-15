import { describe, it, expect, vi } from 'vitest'
import {
  appInstructions, appToolSet, appToolsFromList, handleAppToolsCall, handleAppToolsList, registerAppToolRoutes,
  type AppToolGroup, type AppToolSource
} from '../appsTools'
import { buildVideTools } from '../../bridgeVideTools'

const groups: AppToolGroup[] = [
  { appId: 'ddg', appName: 'DuckDuckGo', instructions: 'Search with it.', tools: [{ name: 'web_search', description: 'Search', inputSchema: { type: 'object' } }] },
  { appId: 'x', appName: 'X', tools: [{ name: 'x_tool', description: 'X', inputSchema: { type: 'object' } }] }
]
const source = (): AppToolSource => ({
  agentToolList: () => groups,
  callAgentTool: vi.fn(async (name: string, args: Record<string, unknown>, w?: number) => `${name}:${JSON.stringify(args)}:${w}`)
})

describe('app tools mapping', () => {
  it('maps a list to proxy tools whose handlers forward the call', async () => {
    const call = vi.fn(async () => 'r')
    const tools = appToolsFromList(groups, call)
    expect(tools.map((t) => t.name)).toEqual(['web_search', 'x_tool'])
    expect(await tools[0].handler({ query: 'q' })).toBe('r')
    expect(call).toHaveBeenCalledWith('web_search', { query: 'q' })
  })
  it('joins only present instructions', () => {
    expect(appInstructions(groups)).toEqual(['Search with it.'])
  })
})

describe('socket routes', () => {
  it('registers list and call routes', async () => {
    const routes = new Map<string, (w: number, b: string) => Promise<unknown>>()
    registerAppToolRoutes({ registerRoute: (u, h) => { routes.set(u, h) } }, source())
    expect([...routes.keys()]).toEqual(['/app-tools/list', '/app-tools/call'])
    expect(await routes.get('/app-tools/list')!(1, '')).toEqual({ apps: groups })
  })
  it('call returns { text } and passes the window id', async () => {
    const s = source()
    expect(await handleAppToolsCall(s, 5, JSON.stringify({ name: 'web_search', args: { query: 'a' } }))).toEqual({ text: 'web_search:{"query":"a"}:5' })
    expect(await handleAppToolsCall(s, 5, JSON.stringify({ name: 'x_tool' }))).toEqual({ text: 'x_tool:{}:5' })
  })
  it('call rejects bad bodies and propagates handler errors (the bridge turns throws into 4xx)', async () => {
    const s = source()
    await expect(handleAppToolsCall(s, 1, 'nope')).rejects.toThrow('JSON')
    await expect(handleAppToolsCall(s, 1, '{}')).rejects.toThrow('Missing tool name')
    s.callAgentTool = async () => { throw new Error('kaput') }
    await expect(handleAppToolsCall(s, 1, JSON.stringify({ name: 'a' }))).rejects.toThrow('kaput')
  })
  it('list handler wraps the host list', async () => {
    expect(await handleAppToolsList(source())).toEqual({ apps: groups })
  })
})

describe('Bridge tool set', () => {
  it('includes app tools and instructions, calling the host in-process with the window id', async () => {
    const s = source()
    const set = buildVideTools([], { dataDir: '/d', apps: s }, 9)
    expect(set.tools.map((t) => t.name)).toEqual(['web_search', 'x_tool'])
    expect(set.instructions).toContain('Search with it.')
    expect(await set.tools[0].handler({ query: 'q' })).toBe('web_search:{"query":"q"}:9')
    expect(appToolSet(s, 2).tools).toHaveLength(2)
  })
  it('adds nothing without a source', () => {
    expect(buildVideTools([], { dataDir: '/d' }, 1).tools).toEqual([])
  })
})
