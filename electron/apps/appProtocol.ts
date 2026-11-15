// `vide-app://<id>/<path>`: serves an installed app's files to the renderer.

import { protocol } from 'electron'
import { readFile } from 'fs/promises'
import { extname, join, resolve, sep } from 'path'

export const APP_SCHEME = 'vide-app'

// Must run before app 'ready'.
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
  ])
}

// null = outside the root or malformed.
export function resolveAppFile(root: string, urlPathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPathname)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const base = resolve(root)
  const file = resolve(join(base, decoded))
  if (!file.startsWith(base + sep)) return null
  return file
}

const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2'
}

export function contentTypeFor(file: string): string {
  return TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
}

// Call inside whenReady.
export function handleAppProtocol(rootFor: (appId: string) => string | null): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const notFound = (): Response => new Response('Not found', { status: 404 })
    let url: URL
    try {
      url = new URL(request.url)
    } catch {
      return notFound()
    }
    const root = rootFor(url.hostname)
    if (!root) return notFound()
    const file = resolveAppFile(root, url.pathname)
    if (!file) return notFound()
    try {
      const body = await readFile(file)
      return new Response(new Uint8Array(body), {
        headers: {
          'Content-Type': contentTypeFor(file),
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        }
      })
    } catch {
      return notFound()
    }
  })
}
