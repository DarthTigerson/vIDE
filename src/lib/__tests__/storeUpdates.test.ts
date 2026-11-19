import { describe, it, expect } from 'vitest'
import { movedApps, pendingUpdates, updateNoticeId, parseMovedNoticeDismissed, MOVED_NOTICE_DISMISSED_KEY } from '../storeUpdates'
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

describe('movedApps', () => {
  const dockerListing = listing('docker', '1.0.0', { replacesBuiltIn: 'docker' })
  const keys = (v: Record<string, string>) => (k: string) => v[k] ?? null
  const enabled = keys({ 'vide:docker:enabled': 'true' })

  it('lists an app whose built-in was enabled and that is not installed', () => {
    expect(movedApps(reg(dockerListing), [], enabled, []).map((a) => a.id)).toEqual(['docker'])
  })
  it('skips a built-in that was disabled or never set', () => {
    expect(movedApps(reg(dockerListing), [], keys({ 'vide:docker:enabled': 'false' }), [])).toEqual([])
    expect(movedApps(reg(dockerListing), [], keys({}), [])).toEqual([])
  })
  it('skips an installed app (any source)', () => {
    expect(movedApps(reg(dockerListing), [installed('docker', '1.0.0')], enabled, [])).toEqual([])
    expect(movedApps(reg(dockerListing), [installed('docker', '1.0.0', { source: 'dev' })], enabled, [])).toEqual([])
  })
  it('lists the web-search replacement when the core search toggle was on', () => {
    const ddg = listing('duckduckgo', '0.1.0', { replacesBuiltIn: 'web-search' })
    expect(movedApps(reg(ddg), [], keys({ 'vide:search:mcpEnabled': 'true' }), []).map((a) => a.id)).toEqual(['duckduckgo'])
    expect(movedApps(reg(ddg), [], keys({ 'vide:search:mcpEnabled': 'false' }), [])).toEqual([])
  })
  it('lists nothing once dismissed', () => {
    expect(movedApps(reg(dockerListing), [], enabled, ['docker'])).toEqual([])
  })
  it('lists a built-in every user had (git-remote) regardless of keys', () => {
    const gp = listing('gitpage', '0.1.0', { replacesBuiltIn: 'git-remote' })
    expect(movedApps(reg(gp), [], keys({}), []).map((a) => a.id)).toEqual(['gitpage'])
    expect(movedApps(reg(gp), [installed('gitpage', '0.1.0')], keys({}), [])).toEqual([])
  })
  it('lists Bike Gauge only for users whose panel was on the gauges view', () => {
    const bg = listing('bike-gauge', '0.1.0', { category: 'usage', replacesBuiltIn: 'bike-gauge' })
    expect(movedApps(reg(bg), [], keys({ 'vide:usagePanelView': 'app:bike-gauge' }), []).map((a) => a.id)).toEqual(['bike-gauge'])
    expect(movedApps(reg(bg), [], keys({ 'vide:usagePanelView': 'bars' }), [])).toEqual([])
    expect(movedApps(reg(bg), [], keys({}), [])).toEqual([])
  })
  it('dismissal is per moved built-in: dismissing docker does not hide git-remote', () => {
    const gp = listing('gitpage', '0.1.0', { replacesBuiltIn: 'git-remote' })
    expect(movedApps(reg(dockerListing, gp), [], enabled, ['docker', 'web-search']).map((a) => a.id)).toEqual(['gitpage'])
    expect(movedApps(reg(dockerListing, gp), [], enabled, ['docker', 'git-remote'])).toEqual([])
  })
  it('lists nothing until the catalog has loaded', () => {
    expect(movedApps(null, [], enabled, [])).toEqual([])
    expect(movedApps({ status: 'too-new' }, [], enabled, [])).toEqual([])
  })
  it('ignores entries without replacesBuiltIn or with an unknown built-in', () => {
    expect(movedApps(reg(listing('docker', '1.0.0')), [], enabled, [])).toEqual([])
    expect(movedApps(reg(listing('x', '1.0.0', { replacesBuiltIn: 'nope' })), [], enabled, [])).toEqual([])
  })
})

describe('moved-notice dismissal storage', () => {
  it('reads the legacy boolean as the built-ins that existed then, a JSON list as-is, junk as none', () => {
    expect(parseMovedNoticeDismissed('true')).toEqual(['docker', 'web-search'])
    expect(parseMovedNoticeDismissed('["git-remote"]')).toEqual(['git-remote'])
    expect(parseMovedNoticeDismissed(null)).toEqual([])
    expect(parseMovedNoticeDismissed('{')).toEqual([])
  })
  it('keeps the key outside every sync category', () => {
    expect(Object.values(CATEGORY_PREFIXES).flat().some((p) => MOVED_NOTICE_DISMISSED_KEY.startsWith(p))).toBe(false)
  })
})
