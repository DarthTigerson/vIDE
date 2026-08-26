import { describe, it, expect, beforeEach } from 'vitest'
import { PassThrough } from 'stream'
import { McpStdioServer, type McpToolDef } from '../protocol'

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

function makeServer(tools: McpToolDef[]) {
  const input = new PassThrough()
  const output = new PassThrough()
  const written: any[] = []
  output.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString('utf8').split('\n')) {
      if (line.trim()) written.push(JSON.parse(line))
    }
  })
  const server = new McpStdioServer({ name: 'vide-todos', version: '1.0.0', tools, input, output })
  server.start()
  return { input, written }
}

function send(input: PassThrough, msg: Record<string, unknown>): Promise<void> {
  input.write(JSON.stringify(msg) + '\n')
  return flush()
}

describe('McpStdioServer', () => {
  let echoTool: McpToolDef

  beforeEach(() => {
    echoTool = {
      name: 'echo',
      description: 'Echoes the given text back',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      handler: async (args) => `echo: ${args.text}`,
    }
  })

  it('responds to initialize with server info and the client-requested protocol version', async () => {
    const { input, written } = makeServer([echoTool])
    await send(input, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } })

    expect(written).toEqual([
      {
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'vide-todos', version: '1.0.0' },
        },
      },
    ])
  })

  it('does not write anything for the initialized notification', async () => {
    const { input, written } = makeServer([echoTool])
    await send(input, { jsonrpc: '2.0', method: 'notifications/initialized' })

    expect(written).toEqual([])
  })

  it('lists the tools it was constructed with', async () => {
    const { input, written } = makeServer([echoTool])
    await send(input, { jsonrpc: '2.0', id: 2, method: 'tools/list' })

    expect(written).toEqual([
      {
        jsonrpc: '2.0',
        id: 2,
        result: { tools: [{ name: 'echo', description: echoTool.description, inputSchema: echoTool.inputSchema }] },
      },
    ])
  })

  it('calls the matching tool handler and wraps its result as text content', async () => {
    const { input, written } = makeServer([echoTool])
    await send(input, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'echo', arguments: { text: 'hi' } },
    })

    expect(written).toEqual([
      { jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: 'echo: hi' }] } },
    ])
  })

  it('returns isError for an unknown tool name', async () => {
    const { input, written } = makeServer([echoTool])
    await send(input, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope', arguments: {} } })

    expect(written[0].result.isError).toBe(true)
    expect(written[0].result.content[0].text).toContain('nope')
  })

  it('returns isError with the thrown message when a handler rejects', async () => {
    const failingTool: McpToolDef = {
      name: 'boom',
      description: 'Always fails',
      inputSchema: { type: 'object', properties: {} },
      handler: async () => {
        throw new Error('kaboom')
      },
    }
    const { input, written } = makeServer([failingTool])
    await send(input, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'boom', arguments: {} } })

    expect(written[0].result).toEqual({ content: [{ type: 'text', text: 'kaboom' }], isError: true })
  })

  it('returns a JSON-RPC error for an unrecognized method with an id', async () => {
    const { input, written } = makeServer([echoTool])
    await send(input, { jsonrpc: '2.0', id: 6, method: 'not/a/real/method' })

    expect(written).toEqual([
      { jsonrpc: '2.0', id: 6, error: { code: -32601, message: 'Method not found: not/a/real/method' } },
    ])
  })

  it('ignores malformed JSON lines instead of crashing', async () => {
    const { input, written } = makeServer([echoTool])
    input.write('not json at all\n')
    await flush()
    await send(input, { jsonrpc: '2.0', id: 7, method: 'tools/list' })

    expect(written).toHaveLength(1)
    expect(written[0].id).toBe(7)
  })

  it('handles a message split across multiple stream chunks', async () => {
    const { input, written } = makeServer([echoTool])
    const json = JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/list' })
    input.write(json.slice(0, 5))
    input.write(json.slice(5) + '\n')
    await flush()

    expect(written).toHaveLength(1)
    expect(written[0].id).toBe(8)
  })

  it('handles two messages arriving in a single chunk', async () => {
    const { input, written } = makeServer([echoTool])
    const a = JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/list' })
    const b = JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'tools/list' })
    input.write(`${a}\n${b}\n`)
    await flush()

    expect(written.map((w) => w.id)).toEqual([9, 10])
  })
})
