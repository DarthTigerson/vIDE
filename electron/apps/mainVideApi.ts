// The `vide` object handed to a store app's main.js `activate(vide)`.

import { spawn as spawnChild } from 'child_process'
import { binaryEnv, resolveBinaryPath } from '../lsp/shellPath'

export interface MainVideApi {
  apiVersion: 1
  appId: string
  app: {
    handle(method: string, fn: (payload: any, ctx: { windowId: number }) => unknown | Promise<unknown>): () => void
    emit(event: string, payload?: unknown, opts?: { windowId?: number }): void
  }
  process: {
    exec(bin: string, args: string[], opts?: { timeoutMs?: number; windowId?: number }): Promise<{ code: number; stdout: string; stderr: string; timedOut?: boolean; errorCode?: string }>
    // `windowId` (from the handler's ctx) ties the child to that window: it is killed when the window closes.
    spawn(
      bin: string,
      args: string[],
      handlers: { onStdout?(chunk: string): void; onStderr?(chunk: string): void; onExit?(code: number | null): void },
      opts?: { windowId?: number }
    ): { kill(): void }
  }
  windows: { onClose(cb: (windowId: number) => void): () => void }
}

export interface MainVideApiDeps {
  handlers: Map<string, Function>
  emit: (event: string, payload: unknown, windowId?: number) => void
  closeListeners: Set<(id: number) => void>
  resolveBin?: (bin: string) => Promise<string | null>
  // Registers a killable child with the host; returns an untrack function.
  trackChild?: (child: { kill(): void }, windowId?: number) => () => void
}

export function createMainVideApi(appId: string, deps: MainVideApiDeps): MainVideApi {
  const resolveBin = deps.resolveBin ?? resolveBinaryPath
  const start = async (bin: string, args: string[]) => {
    // Fall back to the bare name: a non-login PATH may still find it.
    const path = (await resolveBin(bin)) ?? bin
    return spawnChild(path, args, { env: binaryEnv(path) })
  }

  return {
    apiVersion: 1,
    appId,
    app: {
      handle(method, fn) {
        deps.handlers.set(method, fn)
        return () => {
          if (deps.handlers.get(method) === fn) deps.handlers.delete(method)
        }
      },
      emit(event, payload, opts) {
        deps.emit(event, payload, opts?.windowId)
      }
    },
    process: {
      async exec(bin, args, opts) {
        const child = await start(bin, args)
        const untrack = deps.trackChild?.({ kill: () => { child.kill() } }, opts?.windowId)
        return new Promise((resolve) => {
          child.once('close', () => untrack?.())
          let stdout = ''
          let stderr = ''
          let timedOut = false
          const timer = opts?.timeoutMs
            ? setTimeout(() => { timedOut = true; child.kill() }, opts.timeoutMs)
            : null
          child.stdout?.on('data', (c) => { stdout += c.toString() })
          child.stderr?.on('data', (c) => { stderr += c.toString() })
          child.on('error', (e) => {
            if (timer) clearTimeout(timer)
            const errorCode = (e as NodeJS.ErrnoException).code
            resolve({ code: -1, stdout, stderr: stderr || e.message, ...(errorCode ? { errorCode } : {}) })
          })
          child.on('close', (code) => {
            if (timer) clearTimeout(timer)
            resolve({ code: timedOut ? -1 : code ?? -1, stdout, stderr, ...(timedOut ? { timedOut } : {}) })
          })
        })
      },
      spawn(bin, args, handlers, opts) {
        let killed = false
        let child: ReturnType<typeof spawnChild> | null = null
        const handle = {
          kill() {
            killed = true
            child?.kill()
          }
        }
        const untrack = deps.trackChild?.(handle, opts?.windowId)
        void start(bin, args).then((c) => {
          child = c
          if (killed) { c.kill(); return }
          c.stdout?.on('data', (d) => handlers.onStdout?.(d.toString()))
          c.stderr?.on('data', (d) => handlers.onStderr?.(d.toString()))
          c.on('error', () => handlers.onExit?.(null))
          c.on('close', (code) => { untrack?.(); handlers.onExit?.(code) })
        }, () => { untrack?.(); handlers.onExit?.(null) })
        return handle
      }
    },
    windows: {
      onClose(cb) {
        deps.closeListeners.add(cb)
        return () => { deps.closeListeners.delete(cb) }
      }
    }
  }
}
