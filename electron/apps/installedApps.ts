// `userData/apps/installed.json`: which store apps are installed on this machine.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface InstalledRecord {
  id: string
  version: string
  commit: string
  installedAt: number
  // 'file' = installed from a package on disk that is not a Store release:
  // never offered updates. Absent = a normal Store install.
  source?: 'file'
}

const FILE = 'installed.json'

function isRecord(value: unknown): value is InstalledRecord {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.version === 'string' &&
    typeof r.commit === 'string' &&
    typeof r.installedAt === 'number' &&
    (r.source === undefined || r.source === 'file')
  )
}

export function readInstalled(appsDir: string): InstalledRecord[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(appsDir, FILE), 'utf8'))
    return Array.isArray(parsed) ? parsed.filter(isRecord) : []
  } catch {
    return []
  }
}

export function writeInstalled(appsDir: string, records: InstalledRecord[]): void {
  mkdirSync(appsDir, { recursive: true })
  const target = join(appsDir, FILE)
  const tmp = `${target}.tmp`
  writeFileSync(tmp, JSON.stringify(records, null, 2))
  renameSync(tmp, target)
}
