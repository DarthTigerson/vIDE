import { createWriteStream } from 'node:fs'
import { mkdir, rename, stat, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

// Downloads `url` to `dest` through `dest.part`, so a model that takes minutes
// to fetch survives a cancel, a crash or a quit: the next call sends a Range
// request and appends. The file only gets its real name once every expected
// byte has arrived, which is what lets callers treat "dest exists" as "done".
export async function downloadFile(
  url: string,
  dest: string,
  opts: { expectedBytes?: number; signal?: AbortSignal; onProgress?: (received: number, total: number) => void } = {}
): Promise<void> {
  const part = dest + '.part'
  await mkdir(dirname(dest), { recursive: true })
  const existing = await sizeOf(part)
  const response = await fetch(url, {
    headers: existing > 0 ? { Range: `bytes=${existing}-` } : {},
    signal: opts.signal,
  })
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`)

  // A server that ignores Range answers 200 with the whole file: start over.
  const append = response.status === 206
  let received = append ? existing : 0
  const length = Number(response.headers.get('content-length') ?? 0)
  const total = opts.expectedBytes ?? received + length

  const counter = new Transform({
    transform(chunk: Buffer, _enc, done) {
      received += chunk.length
      opts.onProgress?.(received, total)
      done(null, chunk)
    },
  })
  await pipeline(
    Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
    counter,
    createWriteStream(part, { flags: append ? 'a' : 'w' }),
    { signal: opts.signal }
  )

  const finalSize = await sizeOf(part)
  if (finalSize !== total) {
    // A wrong-sized file can't be resumed into the right one.
    await unlink(part).catch(() => {})
    throw new Error(`Download incomplete: got ${finalSize} of ${total} bytes`)
  }
  await rename(part, dest)
}
