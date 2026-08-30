import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import { mkdtempSync, rmSync, existsSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildBrowserTools } from '../browserTools'
import type { McpToolDef } from '../protocol'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void

function startFakeBridge(socketPath: string, handler: Handler): Server {
  if (existsSync(socketPath)) unlinkSync(socketPath)
  const server = createServer(async (req, res) => handler(req, res, await readBody(req)))
  server.listen(socketPath)
  return server
}

function findTool(tools: McpToolDef[], name: string): McpToolDef {
  const tool = tools.find((t) => t.name === name)
  if (!tool) throw new Error(`no tool named ${name}`)
  return tool
}

describe('browserTools', () => {
  let dir: string
  let socketPath: string
  let server: Server | undefined

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vide-browsertools-test-'))
    socketPath = join(dir, 'bridge.sock')
  })

  afterEach(() => {
    server?.close()
    server = undefined
    rmSync(dir, { recursive: true, force: true })
  })

  it('browser_navigate posts the url with the window-id header and reports success', async () => {
    let seenPath = ''
    let seenWindowId = ''
    let seenBody = ''
    server = startFakeBridge(socketPath, (req, res, body) => {
      seenPath = req.url ?? ''
      seenWindowId = String(req.headers['x-vide-window-id'])
      seenBody = body
      res.end(JSON.stringify({ ok: true }))
    })

    const tools = buildBrowserTools(socketPath, '5')
    const result = await findTool(tools, 'browser_navigate').handler({ url: 'https://example.com' })

    expect(seenPath).toBe('/navigate')
    expect(seenWindowId).toBe('5')
    expect(seenBody).toBe('url=https%3A%2F%2Fexample.com')
    expect(result).toBe('Navigated to https://example.com')
  })

  it('browser_screenshot returns an image content result with base64 PNG data plus a size-diagnostic text block', async () => {
    server = startFakeBridge(socketPath, (_req, res) => {
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('X-Vide-Image-Size', '650x400')
      res.setHeader('X-Vide-View-Bounds', '650x400')
      res.end(Buffer.from('fake-png-bytes'))
    })

    const tools = buildBrowserTools(socketPath, '5')
    const result = await findTool(tools, 'browser_screenshot').handler({})

    expect(result).toEqual({
      text: 'Image size: 650x400, page view size: 650x400 (these should match — if not, scale click/type coordinates by the ratio between them)',
      image: { data: Buffer.from('fake-png-bytes').toString('base64'), mimeType: 'image/png' },
    })
  })

  it('browser_click posts x and y and reports the focused element afterward', async () => {
    let seenBody = ''
    server = startFakeBridge(socketPath, (_req, res, body) => {
      seenBody = body
      res.end(JSON.stringify({ ok: true, activeElement: 'INPUT#searchbox_input[type=text]' }))
    })

    const tools = buildBrowserTools(socketPath, '5')
    const result = await findTool(tools, 'browser_click').handler({ x: 12, y: 34 })

    expect(seenBody).toBe('x=12&y=34')
    expect(result).toBe('Clicked at (12, 34). Focused element afterward: INPUT#searchbox_input[type=text]')
  })

  it('browser_type posts the text and reports a character count', async () => {
    server = startFakeBridge(socketPath, (_req, res) => res.end(JSON.stringify({ ok: true })))

    const tools = buildBrowserTools(socketPath, '5')
    const result = await findTool(tools, 'browser_type').handler({ text: 'hello' })

    expect(result).toBe('Typed 5 character(s)')
  })

  it('browser_read_console_logs joins buffered logs, oldest first', async () => {
    server = startFakeBridge(socketPath, (_req, res) => res.end(JSON.stringify({ logs: ['[info] a', '[error] b'] })))

    const tools = buildBrowserTools(socketPath, '5')
    const result = await findTool(tools, 'browser_read_console_logs').handler({})

    expect(result).toBe('[info] a\n[error] b')
  })

  it('browser_read_console_logs reports when there are none yet', async () => {
    server = startFakeBridge(socketPath, (_req, res) => res.end(JSON.stringify({ logs: [] })))

    const tools = buildBrowserTools(socketPath, '5')
    const result = await findTool(tools, 'browser_read_console_logs').handler({})

    expect(result).toBe('No console messages yet.')
  })

  it('browser_read_page_text returns the page text', async () => {
    server = startFakeBridge(socketPath, (_req, res) => res.end(JSON.stringify({ text: 'hello page' })))

    const tools = buildBrowserTools(socketPath, '5')
    const result = await findTool(tools, 'browser_read_page_text').handler({})

    expect(result).toBe('hello page')
  })

  it('browser_read_page_text reports an empty page', async () => {
    server = startFakeBridge(socketPath, (_req, res) => res.end(JSON.stringify({ text: '' })))

    const tools = buildBrowserTools(socketPath, '5')
    const result = await findTool(tools, 'browser_read_page_text').handler({})

    expect(result).toBe('(empty page)')
  })

  it('throws the bridge-reported error message on a non-2xx JSON response', async () => {
    server = startFakeBridge(socketPath, (_req, res) => {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'No Claude-controlled tab open for this window yet — call navigate first' }))
    })

    const tools = buildBrowserTools(socketPath, '5')
    await expect(findTool(tools, 'browser_screenshot').handler({})).rejects.toThrow(/call navigate first/)
  })

  it('throws a raw non-JSON error body as-is', async () => {
    server = startFakeBridge(socketPath, (_req, res) => {
      res.statusCode = 500
      res.end('internal error, not json')
    })

    const tools = buildBrowserTools(socketPath, '5')
    await expect(findTool(tools, 'browser_screenshot').handler({})).rejects.toThrow('internal error, not json')
  })

  it('reports a clear error when the bridge socket is unreachable', async () => {
    // Never started — nothing is listening on this socket path.
    const tools = buildBrowserTools(join(dir, 'nonexistent.sock'), '5')
    await expect(findTool(tools, 'browser_navigate').handler({ url: 'https://example.com' })).rejects.toThrow(
      /Could not reach vIDE's browser bridge/
    )
  })
})
