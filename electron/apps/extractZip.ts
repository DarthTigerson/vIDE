// Safe extraction of a store app package. Every entry name is validated before
// any file is written, so a hostile zip leaves nothing behind.

import { unzipSync } from 'fflate'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { posix } from 'path'

function isSafeName(name: string): boolean {
  if (name === '' || name.includes('\\') || name.includes('\0') || name.startsWith('/')) return false
  const normalized = posix.normalize(name)
  if (normalized === '.' || normalized.startsWith('/')) return false
  return !normalized.split('/').includes('..') && !name.split('/').includes('..')
}

export interface ExtractLimits {
  maxTotalBytes?: number
  maxEntries?: number
}

const DEFAULT_MAX_TOTAL_BYTES = 200 * 1024 * 1024
const DEFAULT_MAX_ENTRIES = 5000

export function extractZip(zip: Uint8Array, destDir: string, limits: ExtractLimits = {}): void {
  const maxTotal = limits.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES
  const maxEntries = limits.maxEntries ?? DEFAULT_MAX_ENTRIES
  let declaredTotal = 0
  let count = 0
  let tooLarge = false
  let entries: Record<string, Uint8Array>
  try {
    // The filter runs before inflating, so a deflate bomb is refused up front.
    entries = unzipSync(zip, {
      filter: (file) => {
        count += 1
        declaredTotal += file.originalSize
        if (count > maxEntries || declaredTotal > maxTotal) {
          tooLarge = true
          throw new Error('too large')
        }
        return true
      }
    })
  } catch {
    throw new Error(tooLarge ? 'bad zip: too large' : 'bad zip')
  }
  let actual = 0
  for (const data of Object.values(entries)) actual += data.byteLength
  if (actual > maxTotal) throw new Error('bad zip: too large')
  const names = Object.keys(entries)
  for (const name of names) {
    if (!isSafeName(name)) throw new Error(`unsafe path: ${name}`)
  }
  for (const name of names) {
    if (name.endsWith('/')) continue
    const target = join(destDir, posix.normalize(name))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, entries[name])
  }
}
