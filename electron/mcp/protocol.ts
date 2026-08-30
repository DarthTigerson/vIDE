// A tool can return plain text (the common case) or, for tools like a
// screenshot, an image alongside optional text — the MCP image content
// block a client can actually render/see, not a base64 string dressed up
// as text.
export interface McpToolImageResult {
  text?: string
  image: { data: string; mimeType: string }
}

export interface McpToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (args: Record<string, unknown>) => Promise<string | McpToolImageResult>
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }

function toContentBlocks(result: string | McpToolImageResult): ContentBlock[] {
  if (typeof result === 'string') return [{ type: 'text', text: result }]
  const blocks: ContentBlock[] = []
  if (result.text) blocks.push({ type: 'text', text: result.text })
  blocks.push({ type: 'image', data: result.image.data, mimeType: result.image.mimeType })
  return blocks
}

interface JsonRpcMessage {
  jsonrpc: '2.0'
  id?: number | string
  method?: string
  params?: { name?: string; arguments?: Record<string, unknown>; protocolVersion?: string }
}

export interface McpStdioServerOptions {
  name: string
  version: string
  tools: McpToolDef[]
  instructions?: string
  input: NodeJS.ReadableStream
  output: NodeJS.WritableStream
}

// Minimal MCP server over stdio: newline-delimited JSON-RPC 2.0, the
// transport Claude Code's CLI speaks for locally-spawned tool servers. Only
// the handshake + tools surface is implemented (initialize, tools/list,
// tools/call) since that's all a stdio tool server needs to expose — no
// resources/prompts support, matching the minimal-client precedent set by
// electron/lsp/protocol.ts on the other side of this app's IPC.
export class McpStdioServer {
  private buffer = ''

  constructor(private opts: McpStdioServerOptions) {}

  start(): void {
    this.opts.input.on('data', (chunk: Buffer) => this.onData(chunk))
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8')
    let newlineAt: number
    while ((newlineAt = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineAt).trim()
      this.buffer = this.buffer.slice(newlineAt + 1)
      if (line) this.handleLine(line)
    }
  }

  private handleLine(line: string): void {
    let msg: JsonRpcMessage
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    void this.dispatch(msg)
  }

  private write(payload: Record<string, unknown>): void {
    this.opts.output.write(`${JSON.stringify(payload)}\n`)
  }

  private async dispatch(msg: JsonRpcMessage): Promise<void> {
    const { id, method, params } = msg

    if (method === 'notifications/initialized') return

    if (method === 'initialize') {
      this.write({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: this.opts.name, version: this.opts.version },
          ...(this.opts.instructions ? { instructions: this.opts.instructions } : {}),
        },
      })
      return
    }

    if (method === 'tools/list') {
      this.write({
        jsonrpc: '2.0',
        id,
        result: {
          tools: this.opts.tools.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        },
      })
      return
    }

    if (method === 'tools/call') {
      const tool = this.opts.tools.find((t) => t.name === params?.name)
      if (!tool) {
        this.write({
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: `Unknown tool: ${params?.name}` }], isError: true },
        })
        return
      }
      try {
        const result = await tool.handler(params?.arguments ?? {})
        this.write({ jsonrpc: '2.0', id, result: { content: [...toContentBlocks(result)] } })
      } catch (err) {
        this.write({
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }], isError: true },
        })
      }
      return
    }

    if (id !== undefined) {
      this.write({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } })
    }
  }
}
