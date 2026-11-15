import { describe, it, expect, vi } from 'vitest'
import { createMainVideApi } from '../mainVideApi'

function make() {
  const handlers = new Map<string, Function>()
  const emit = vi.fn()
  const closeListeners = new Set<(id: number) => void>()
  const api = createMainVideApi('hello', {
    handlers, emit, closeListeners,
    resolveBin: async (bin) => (bin === 'node' ? process.execPath : null)
  })
  return { api, handlers, emit, closeListeners }
}

describe('createMainVideApi', () => {
  it('handle registers and unsubscribe removes', () => {
    const { api, handlers } = make()
    const off = api.app.handle('ping', () => 1)
    expect(handlers.has('ping')).toBe(true)
    off()
    expect(handlers.has('ping')).toBe(false)
  })

  it('emit forwards the window id', () => {
    const { api, emit } = make()
    api.app.emit('tick', { a: 1 }, { windowId: 7 })
    expect(emit).toHaveBeenCalledWith('tick', { a: 1 }, 7)
    api.app.emit('tock')
    expect(emit).toHaveBeenLastCalledWith('tock', undefined, undefined)
  })

  it('exec runs a process', async () => {
    const { api } = make()
    const r = await api.process.exec('node', ['-e', 'console.log(1)'])
    expect(r).toEqual({ code: 0, stdout: '1\n', stderr: '' })
  })

  it('exec flags a timeout and a missing binary', async () => {
    const { api } = make()
    const slow = await api.process.exec('node', ['-e', "process.stderr.write('x'); setInterval(()=>{},1000)"], { timeoutMs: 300 })
    expect(slow.code).toBe(-1)
    expect(slow.timedOut).toBe(true)
    const missing = await api.process.exec('vide-no-such-binary-xyz', [])
    expect(missing.code).toBe(-1)
    expect(missing.errorCode).toBe('ENOENT')
  })

  it('spawn streams stdout and kill ends it', async () => {
    const { api } = make()
    const out: string[] = []
    const exited = new Promise<number | null>((res) => {
      const p = api.process.spawn(
        'node',
        ['-e', "console.log('hi'); setInterval(()=>{},1000)"],
        { onStdout: (c) => { out.push(c); p.kill() }, onExit: res }
      )
    })
    await exited
    expect(out.join('')).toContain('hi')
  })

  it('windows.onClose listener fires and unsubscribes', () => {
    const { api, closeListeners } = make()
    const cb = vi.fn()
    const off = api.windows.onClose(cb)
    closeListeners.forEach((l) => l(3))
    expect(cb).toHaveBeenCalledWith(3)
    off()
    expect(closeListeners.size).toBe(0)
  })
})
