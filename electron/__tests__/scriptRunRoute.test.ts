import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createScript } from '../scriptsData'
import { handleRunScriptRequest } from '../scriptRunRoute'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'run-route-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

function deps(overrides: Partial<Parameters<typeof handleRunScriptRequest>[0]> = {}) {
  let emit: (d: string) => void = () => {}
  const order: string[] = []
  const base = {
    dataDir: dir,
    timeoutMs: 1000,
    watch: vi.fn((_w: number, _id: string, onData: (d: string) => void) => { order.push('watch'); emit = onData; return () => {} }),
    sendRunRequest: vi.fn((_w: number, req: { terminalId: string; scriptId: string; command: string }) => {
      order.push('send')
      const token = req.terminalId.replace('script-', '')
      setTimeout(() => emit(`hi\r\n\x1b]6973;${token};0\x07`), 0)
      return true
    }),
    ...overrides,
  }
  return { base, order }
}

describe('handleRunScriptRequest', () => {
  it('watches the terminal before asking the window to open it, and returns the formatted result', async () => {
    const script = await createScript(dir, { title: 'Hello', body: 'echo hi' })
    const { base, order } = deps()
    const out = await handleRunScriptRequest(base, 7, new URLSearchParams({ id: script.id }).toString())
    expect(order).toEqual(['watch', 'send'])
    const req = base.sendRunRequest.mock.calls[0][1]
    expect(req.scriptId).toBe(script.id)
    expect(req.command.startsWith('echo hi\nprintf')).toBe(true)
    expect(out).toEqual({ text: 'Script "Hello" finished with exit code 0 (success).\n\nOutput:\nhi' })
  })

  it('errors for an unknown script', async () => {
    const { base } = deps()
    await expect(handleRunScriptRequest(base, 7, 'id=nope')).rejects.toThrow(/not found/)
  })

  it('errors when the window is gone, and stops watching', async () => {
    const script = await createScript(dir, { title: 'Hello', body: 'echo hi' })
    const unwatch = vi.fn()
    const { base } = deps({ sendRunRequest: vi.fn(() => false), watch: vi.fn(() => unwatch) })
    await expect(handleRunScriptRequest(base, 7, `id=${script.id}`)).rejects.toThrow(/window/)
    expect(unwatch).toHaveBeenCalled()
  })
})
