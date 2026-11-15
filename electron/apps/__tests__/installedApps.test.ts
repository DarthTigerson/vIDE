import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { readInstalled, writeInstalled } from '../installedApps'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'installed-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('installedApps', () => {
  it('round-trips records', () => {
    const records = [{ id: 'hello', version: '1.0.0', commit: 'abc', installedAt: 5 }]
    writeInstalled(dir, records)
    expect(readInstalled(dir)).toEqual(records)
  })

  it('round-trips the disabled flag and rejects a non-true value', () => {
    const rec = { id: 'hello', version: '1.0.0', commit: 'abc', installedAt: 5, disabled: true as const }
    writeInstalled(dir, [rec])
    expect(readInstalled(dir)).toEqual([rec])
    writeFileSync(join(dir, 'installed.json'), JSON.stringify([{ ...rec, disabled: 'yes' }]))
    expect(readInstalled(dir)).toEqual([])
  })

  it('returns [] for a missing or corrupt file', () => {
    expect(readInstalled(dir)).toEqual([])
    writeFileSync(join(dir, 'installed.json'), '{not json')
    expect(readInstalled(dir)).toEqual([])
  })

  it('drops records with missing fields', () => {
    const good = { id: 'a', version: '1.0.0', commit: 'c', installedAt: 1 }
    writeFileSync(join(dir, 'installed.json'), JSON.stringify([good, { id: 'b' }, 'x', null, { ...good, installedAt: 'n' }]))
    expect(readInstalled(dir)).toEqual([good])
  })
})
