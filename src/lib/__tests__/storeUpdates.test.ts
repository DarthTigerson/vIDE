import { describe, it, expect } from 'vitest'
import { pendingUpdates, updateNoticeId } from '../storeUpdates'
import { CATEGORY_PREFIXES } from '@/stores/configRepoStore'
import type { AppInfo, RegistryState, StoreListing } from '@/types/api'

function listing(id: string, version: string, extra: Partial<StoreListing> = {}): StoreListing {
  return {
    id, name: id.toUpperCase(), description: 'd', repo: 'o/r', firstParty: true, compatible: true,
    recommended: false, category: 'applications', targets: ['vide'],
    latest: { version, commit: 'a'.repeat(40), url: 'https://x', sha256: 'b'.repeat(64), minVide: '0.4.0' },
    ...extra,
  }
}
function installed(id: string, version: string, extra: Partial<AppInfo> = {}): AppInfo {
  return { id, name: id, version, source: 'store', rendererUrl: '', hasMain: false, contributes: {}, status: 'loaded', ...extra }
}
function reg(...apps: StoreListing[]): RegistryState {
  return { status: 'ok', checkedAt: 1, fromCache: false, apps }
}

describe('pendingUpdates', () => {
  it('lists installed apps with a newer compatible listing', () => {
    expect(pendingUpdates(reg(listing('docker', '1.1.0')), [installed('docker', '1.0.0')], []))
      .toEqual([{ id: 'docker', name: 'DOCKER', version: '1.1.0' }])
  })
  it('skips incompatible, dismissed, not-installed, dev, equal and missing registry', () => {
    expect(pendingUpdates(reg(listing('docker', '1.1.0', { compatible: false })), [installed('docker', '1.0.0')], [])).toEqual([])
    expect(pendingUpdates(reg(listing('docker', '1.1.0')), [installed('docker', '1.0.0')], [updateNoticeId('docker', '1.1.0')])).toEqual([])
    expect(pendingUpdates(reg(listing('docker', '1.1.0')), [], [])).toEqual([])
    expect(pendingUpdates(reg(listing('docker', '1.1.0')), [installed('docker', '1.0.0', { source: 'dev' })], [])).toEqual([])
    expect(pendingUpdates(reg(listing('docker', '1.0.0')), [installed('docker', '1.0.0')], [])).toEqual([])
    expect(pendingUpdates(null, [installed('docker', '1.0.0')], [])).toEqual([])
    expect(pendingUpdates({ status: 'too-new' }, [installed('docker', '1.0.0')], [])).toEqual([])
  })
  it('skips restart-required and failed installs', () => {
    for (const status of ['restart-required', 'failed'] as const) {
      expect(pendingUpdates(reg(listing('docker', '1.1.0')), [installed('docker', '1.0.0', { status })], [])).toEqual([])
    }
  })
  it('dismissing 1.1.0 does not hide 1.2.0', () => {
    const dismissed = [updateNoticeId('docker', '1.1.0')]
    expect(pendingUpdates(reg(listing('docker', '1.2.0')), [installed('docker', '1.0.0')], dismissed)).toHaveLength(1)
  })
  it('builds the notice id', () => {
    expect(updateNoticeId('docker', '1.1.0')).toBe('store-update-docker-1.1.0')
  })
})

describe('dismissed-updates key', () => {
  it('is in no sync category prefix', () => {
    const key = 'vide:store:dismissedUpdates'
    for (const prefixes of Object.values(CATEGORY_PREFIXES)) {
      expect(prefixes.some((p) => key === p || key.startsWith(p))).toBe(false)
    }
  })
})
