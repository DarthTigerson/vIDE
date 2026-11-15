// `vide://store/<id>` links (the "Open in vIDE" button on vsuite.tech).
// Pure, so it unit-tests in plain node.

import { ID_RE } from './storeRegistry'

export type VideUrlRequest = { kind: 'store'; id: string | null }

// `id` is null when the link names no (valid) app: vIDE then opens the Store
// tab instead of rejecting the link. Anything that is not a vide://store link
// is null and ignored.
export function parseVideUrl(raw: string): VideUrlRequest | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'vide:' || url.hostname !== 'store') return null
  let id: string
  try {
    id = decodeURIComponent(url.pathname.replace(/^\/+/, '').replace(/\/+$/, ''))
  } catch {
    return { kind: 'store', id: null }
  }
  return { kind: 'store', id: ID_RE.test(id) ? id : null }
}

// The first vide:// argument of a process argv (Linux second-instance).
export function videUrlFromArgv(argv: string[]): string | null {
  return argv.find((a) => typeof a === 'string' && a.startsWith('vide://')) ?? null
}
