import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { probeCompletion } from './infill'

// The llama.vscode / `--fim-qwen-*-default` tuning, trimmed for memory: one
// slot (one editor typing at a time), an 8K window instead of the model's
// full 32K, and a 256 MiB prompt cache instead of the 8 GiB default.
// Verified against llama.cpp b11707.
export function buildServerArgs(o: {
  modelPath: string
  port: number
  apiKey: string
  platform: NodeJS.Platform
  extraArgs?: string[]
}): string[] {
  const args = [
    '-m', o.modelPath, '--host', '127.0.0.1', '--port', String(o.port), '--api-key', o.apiKey,
    '-np', '1', '-ub', '1024', '-b', '1024', '-c', '8192', '--cache-reuse', '256', '-cram', '256', '--no-webui',
  ]
  // The Linux release is the CPU build; on Apple Silicon Metal does the work.
  if (o.platform === 'darwin') args.push('-ngl', '99')
  return [...args, ...(o.extraArgs ?? [])]
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address()
      const port = typeof address === 'object' && address ? address.port : 0
      srv.close(() => resolve(port))
    })
  })
}

const LOG_TAIL_BYTES = 4096
const HEALTH_POLL_MS = 250

// One running llama-server. Ready means more than /health: on an 8 GB Mac a
// model too big for the GPU loads, answers /health 200, then fails every
// completion with "Insufficient Memory" — so start() also runs one real probe
// completion and treats its failure as a failed start.
export class LlamaServerProcess {
  private proc: ChildProcess | null = null
  private log = ''
  private exitCallbacks: ((code: number | null, lastLog: string) => void)[] = []

  get pid(): number | null {
    return this.proc?.pid ?? null
  }

  onExit(cb: (code: number | null, lastLog: string) => void): void {
    this.exitCallbacks.push(cb)
  }

  async start(binary: string, args: string[], port: number, apiKey: string, opts: { readyTimeoutMs?: number } = {}): Promise<void> {
    this.stop()
    this.log = ''
    const proc = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    this.proc = proc
    const append = (chunk: Buffer) => { this.log = (this.log + chunk.toString()).slice(-LOG_TAIL_BYTES) }
    proc.stdout?.on('data', append)
    proc.stderr?.on('data', append)

    let exited = false
    let spawnError: Error | null = null
    proc.on('error', (err) => { spawnError = err; exited = true })
    proc.on('exit', (code) => {
      exited = true
      if (this.proc === proc) this.proc = null
      for (const cb of this.exitCallbacks) cb(code, this.log)
    })

    const baseUrl = `http://127.0.0.1:${port}`
    const deadline = Date.now() + (opts.readyTimeoutMs ?? 60000)
    try {
      while (true) {
        if (exited) throw spawnError ?? new Error(this.failureMessage('llama-server exited while loading the model'))
        if (Date.now() > deadline) throw new Error('llama-server took too long to load the model')
        const healthy = await fetch(`${baseUrl}/health`).then((r) => r.ok, () => false)
        if (healthy) break
        await new Promise((r) => setTimeout(r, HEALTH_POLL_MS))
      }
      const probe = await probeCompletion({ kind: 'infill', baseUrl, apiKey })
      if (!probe.ok) throw new Error(probe.message ?? this.failureMessage('Model failed to load'))
    } catch (err) {
      this.stop()
      throw err
    }
  }

  stop(): void {
    const proc = this.proc
    this.proc = null
    proc?.kill()
  }

  // The server's own explanation beats a generic one: its last line
  // mentioning an error ("Insufficient Memory", "failed to load model").
  private failureMessage(fallback: string): string {
    const lines = this.log.split('\n').map((l) => l.trim()).filter((l) => /error/i.test(l))
    const last = lines.at(-1)
    return last ? last.replace(/^.*?\berror:\s*/i, '') : fallback
  }
}
