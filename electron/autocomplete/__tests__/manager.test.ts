import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn(), getAllWindows: () => [] },
  app: { getPath: () => '/tmp' },
}))

import { AutocompleteManager, type ManagerDeps } from '../manager'
import { MODEL_CATALOG } from '../catalog'
import type { AutocompletePhase, AutocompleteRuntimeState } from '../types'

const GB = 1e9
const qwen = { kind: 'managed', modelId: 'qwen-1.5b' } as const

class FakeServer {
  static instances: FakeServer[] = []
  pid: number | null = null
  startCalls = 0
  stopped = false
  failWith: string | null = null
  exitCb: ((code: number | null, log: string) => void) | null = null
  constructor() { FakeServer.instances.push(this) }
  async start() {
    this.startCalls++
    await Promise.resolve()
    if (this.failWith) throw new Error(this.failWith)
    this.pid = 4242
  }
  stop() { this.stopped = true; this.pid = null }
  onExit(cb: (code: number | null, log: string) => void) { this.exitCb = cb }
}

let phases: AutocompletePhase[]
let deps: ManagerDeps
let binaryInstalled: boolean
let modelPresent: boolean
let failNextServer: string | null
let downloadGate: { resolve: () => void; signal?: AbortSignal } | null

function makeDeps(overrides: Partial<ManagerDeps> = {}): ManagerDeps {
  return {
    userDataDir: '/data',
    platform: 'darwin',
    modelSearchDirs: ['/data/autocomplete/models'],
    getMemory: async () => ({ totalBytes: 8 * GB, usedBytes: 4 * GB }),
    findInstalledLlamaServer: async () => (binaryInstalled ? '/bin/llama-server' : null),
    installLlama: async () => { binaryInstalled = true; return '/bin/llama-server' },
    findModelOnDisk: async () => (modelPresent ? '/data/autocomplete/models/m.gguf' : null),
    download: async (_url, _dest, opts) => {
      opts?.onProgress?.(1, 2)
      if (downloadGate) {
        await new Promise<void>((resolve, reject) => {
          downloadGate!.resolve = resolve
          opts?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
      }
      modelPresent = true
    },
    fileSize: async () => 2 * GB,
    createServer: () => {
      const s = new FakeServer()
      s.failWith = failNextServer
      return s
    },
    freePort: async () => 5555,
    requestCompletion: vi.fn(async () => 'x'),
    probeCompletion: vi.fn(async () => ({ ok: true })),
    graphContext: { chunksFor: vi.fn(async () => []) },
    broadcast: (s: AutocompleteRuntimeState) => { if (phases.at(-1) !== s.phase) phases.push(s.phase) },
    ...overrides,
  }
}

beforeEach(() => {
  FakeServer.instances = []
  phases = []
  binaryInstalled = true
  modelPresent = true
  failNextServer = null
  downloadGate = null
  deps = makeDeps()
})

describe('configure', () => {
  it('reports a managed model already on disk with its RAM estimate', async () => {
    const mgr = new AutocompleteManager(deps)
    const state = await mgr.configure(qwen)
    expect(state.modelOnDisk).toBe(true)
    expect(state.ramBytes).toBe(MODEL_CATALOG['qwen-1.5b'].ramBytes)
  })

  it('stops a running server when autocomplete is disabled', async () => {
    const mgr = new AutocompleteManager(deps)
    await mgr.configure(qwen)
    await mgr.start()
    await mgr.configure(null)
    expect(FakeServer.instances[0].stopped).toBe(true)
    expect(mgr.pid).toBeNull()
  })
})

describe('start', () => {
  it('refuses to start a model that does not fit in free RAM', async () => {
    deps = makeDeps({ getMemory: async () => ({ totalBytes: 8 * GB, usedBytes: 7 * GB }) })
    const mgr = new AutocompleteManager(deps)
    await mgr.configure(qwen)
    await mgr.start()
    const state = mgr.getState()
    expect(state.phase).toBe('error')
    expect(state.error?.kind).toBe('no-fit')
    // GB as the RAM panel counts them (formatMemory: 1024³ bytes)
    expect(state.error?.message).toBe('Not enough free RAM (needs ~1.8 GB, 0.9 GB free)')
    expect(FakeServer.instances).toHaveLength(0)
  })

  it('starts anyway when forced past the fit check', async () => {
    deps = makeDeps({ getMemory: async () => ({ totalBytes: 8 * GB, usedBytes: 7 * GB }) })
    const mgr = new AutocompleteManager(deps)
    await mgr.configure(qwen)
    await mgr.start(true)
    expect(mgr.getState().phase).toBe('running')
  })

  it('installs llama.cpp and downloads the model when neither is there', async () => {
    binaryInstalled = false
    modelPresent = false
    const mgr = new AutocompleteManager(deps)
    await mgr.configure(qwen)
    phases = []
    await mgr.start()
    expect(phases).toEqual(['installing', 'downloading', 'starting', 'running'])
    expect(mgr.getState().modelOnDisk).toBe(true)
  })

  it('goes straight to starting when everything is already on disk', async () => {
    const mgr = new AutocompleteManager(deps)
    await mgr.configure(qwen)
    phases = []
    await mgr.start()
    expect(phases).toEqual(['starting', 'running'])
    expect(mgr.pid).toBe(4242)
  })

  it('starts exactly one server when two windows start at once', async () => {
    const mgr = new AutocompleteManager(deps)
    await mgr.configure(qwen)
    await Promise.all([mgr.start(), mgr.start()])
    expect(FakeServer.instances).toHaveLength(1)
  })

  it("reports the server's own failure message", async () => {
    failNextServer = 'Insufficient Memory (kIOGPUCommandBufferCallbackErrorOutOfMemory)'
    const mgr = new AutocompleteManager(deps)
    await mgr.configure(qwen)
    await mgr.start()
    expect(mgr.getState().error).toEqual({ kind: 'failed', message: expect.stringContaining('Insufficient Memory') })
  })

  it('never blocks a custom GGUF on the fit check', async () => {
    deps = makeDeps({ getMemory: async () => ({ totalBytes: 8 * GB, usedBytes: 7.9 * GB }) })
    const mgr = new AutocompleteManager(deps)
    await mgr.configure({ kind: 'gguf', path: '/m/custom.gguf', extraArgs: '-t 4' })
    await mgr.start()
    expect(mgr.getState().phase).toBe('running')
  })

  it("reports a custom server's own error when its probe fails", async () => {
    const mgr = new AutocompleteManager(makeDeps({ probeCompletion: async () => ({ ok: false, message: 'model not found' }) }))
    await mgr.configure({ kind: 'server', baseUrl: 'http://127.0.0.1:8012', api: 'openai', apiKey: '' })
    await mgr.start()
    expect(mgr.getState().error?.message).toBe("Couldn't get a completion from http://127.0.0.1:8012: model not found")
  })

  it('probes a custom server instead of starting one', async () => {
    const mgr = new AutocompleteManager(deps)
    await mgr.configure({ kind: 'server', baseUrl: 'http://127.0.0.1:8012', api: 'infill', apiKey: '' })
    await mgr.start()
    expect(mgr.getState().phase).toBe('running')
    expect(FakeServer.instances).toHaveLength(0)
  })

  it('becomes an error when the running server dies on its own', async () => {
    const mgr = new AutocompleteManager(deps)
    await mgr.configure(qwen)
    await mgr.start()
    FakeServer.instances[0].exitCb?.(1, 'segfault')
    expect(mgr.getState().phase).toBe('error')
  })
})

describe('stop', () => {
  function gate<T>(value: T) {
    let release!: () => void
    const promise = new Promise<T>((resolve) => { release = () => resolve(value) })
    return { promise, release }
  }

  it('stays stopped when stopped while looking for the model, and can start again', async () => {
    modelPresent = false
    const lookup = gate<string | null>(null)
    let calls = 0
    const mgr = new AutocompleteManager(makeDeps({
      findModelOnDisk: async () => (++calls === 2 ? lookup.promise : (modelPresent ? '/m.gguf' : null)),
    }))
    await mgr.configure(qwen)
    const starting = mgr.start()
    await vi.waitFor(() => expect(calls).toBe(2))
    mgr.stop()
    lookup.release()
    await starting
    expect(mgr.getState().phase).toBe('stopped')
    modelPresent = true
    await mgr.start()
    expect(mgr.getState().phase).toBe('running')
  })

  it('never spawns a server when stopped while picking a port', async () => {
    const port = gate(5555)
    const mgr = new AutocompleteManager(makeDeps({ freePort: () => port.promise }))
    await mgr.configure(qwen)
    const starting = mgr.start()
    await vi.waitFor(() => expect(mgr.getState().phase).toBe('starting'))
    mgr.stop()
    port.release()
    await starting
    expect(FakeServer.instances).toHaveLength(0)
    expect(mgr.getState().phase).toBe('stopped')
  })

  it('sends download progress only when the whole percent changes', async () => {
    modelPresent = false
    const sent: number[] = []
    const mgr = new AutocompleteManager(makeDeps({
      download: async (_u, _d, opts) => {
        for (let i = 1; i <= 10000; i++) opts?.onProgress?.(i, 10000)
        modelPresent = true
      },
      broadcast: (st) => { if (st.phase === 'downloading' && st.progress) sent.push(st.progress.received) },
    }))
    await mgr.configure(qwen)
    await mgr.start()
    expect(sent.length).toBeLessThanOrEqual(102)
    expect(sent.at(-1)).toBe(10000)
  })

  it('aborts an in-progress download and ends stopped', async () => {
    modelPresent = false
    downloadGate = { resolve: () => {} }
    const mgr = new AutocompleteManager(deps)
    await mgr.configure(qwen)
    const starting = mgr.start()
    await vi.waitFor(() => expect(mgr.getState().phase).toBe('downloading'))
    mgr.stop()
    await starting
    expect(mgr.getState().phase).toBe('stopped')
    expect(FakeServer.instances).toHaveLength(0)
  })

  it('kills the server when the app quits', async () => {
    const mgr = new AutocompleteManager(deps)
    await mgr.configure(qwen)
    await mgr.start()
    mgr.dispose()
    expect(FakeServer.instances[0].stopped).toBe(true)
  })
})

describe('complete', () => {
  it('returns null without a request while not running', async () => {
    const mgr = new AutocompleteManager(deps)
    await mgr.configure(qwen)
    expect(await mgr.complete(1, { prefix: 'a', suffix: 'b' })).toBeNull()
    expect(deps.requestCompletion).not.toHaveBeenCalled()
  })

  it("aborts the window's previous request when a new one arrives", async () => {
    const signals: AbortSignal[] = []
    deps = makeDeps({
      // Like the real one: an aborted request resolves null.
      requestCompletion: vi.fn(async (_ep, _req, signal?: AbortSignal) => { signals.push(signal!); await Promise.resolve(); return signal!.aborted ? null : 'x' }),
    })
    const mgr = new AutocompleteManager(deps)
    await mgr.configure(qwen)
    await mgr.start()
    signals.length = 0
    const first = mgr.complete(1, { prefix: 'a', suffix: '' })
    const second = mgr.complete(1, { prefix: 'ab', suffix: '' })
    const [a, b] = await Promise.all([first, second])
    expect(a).toBeNull()
    expect(b).toBe('x')
    expect(signals.at(-1)!.aborted).toBe(false)
    expect(signals.slice(0, -1).every((sig) => sig.aborted)).toBe(true)
  })

  it("adds the project graph's definitions after the editor's own snippets", async () => {
    const request = vi.fn(async () => 'x')
    deps = makeDeps({
      requestCompletion: request,
      graphContext: { chunksFor: vi.fn(async () => [{ filename: 'src/store.ts', text: 'export function openTab(tab: Tab) {' }]) },
    })
    const mgr = new AutocompleteManager(deps)
    await mgr.configure(qwen)
    await mgr.start()
    await mgr.complete(1, { prefix: 'openTab(', suffix: ')', filePath: '/p/src/Panel.tsx', extra: [{ filename: 'src/a.ts', text: 'a' }] })
    expect(deps.graphContext.chunksFor).toHaveBeenCalledWith('/p/src/Panel.tsx', 'openTab(', ')')
    expect(request).toHaveBeenCalledWith(expect.anything(), {
      prefix: 'openTab(', suffix: ')',
      extra: [{ filename: 'src/a.ts', text: 'a' }, { filename: 'src/store.ts', text: 'export function openTab(tab: Tab) {' }],
    }, expect.anything())
  })

  it('still completes when the graph lookup fails', async () => {
    deps = makeDeps({ graphContext: { chunksFor: vi.fn(async () => { throw new Error('bad graph') }) } })
    const mgr = new AutocompleteManager(deps)
    await mgr.configure(qwen)
    await mgr.start()
    expect(await mgr.complete(1, { prefix: 'a', suffix: '', filePath: '/p/a.ts' })).toBe('x')
  })
})
