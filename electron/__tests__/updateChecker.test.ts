import { describe, it, expect, beforeEach, vi } from 'vitest'

const { handlers } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => unknown>,
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => unknown) => {
      handlers[channel] = fn
    },
  },
}))

import { UpdateChecker, compareVersions, parseSeverity, pendingUpdate } from '../updateChecker'

function mockFetchOnce(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => body }))
}

describe('compareVersions', () => {
  it('detects a newer patch version', () => {
    expect(compareVersions('0.1.1', '0.1.0')).toBeGreaterThan(0)
  })

  it('detects a newer minor/major version', () => {
    expect(compareVersions('0.2.0', '0.1.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0)
  })

  it('detects an older version', () => {
    expect(compareVersions('0.1.0', '0.1.1')).toBeLessThan(0)
  })

  it('treats equal versions as equal', () => {
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0)
  })

  it('handles differing segment counts', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.1', '1.0')).toBeGreaterThan(0)
  })
})

const rel = (tag: string, body = '', extra: Record<string, unknown> = {}) => ({
  tag_name: tag, html_url: `https://example.com/${tag}`, draft: false, prerelease: false, body, ...extra,
})

describe('parseSeverity', () => {
  it('reads the marker from release notes', () => {
    expect(parseSeverity('Fixes\n<!-- vide-update: severity=urgent -->')).toBe('urgent')
    expect(parseSeverity('<!--vide-update: severity=CRITICAL-->')).toBe('critical')
  })

  it('treats a missing or unknown marker as normal', () => {
    expect(parseSeverity('Just features')).toBe('normal')
    expect(parseSeverity(null)).toBe('normal')
    expect(parseSeverity('<!-- vide-update: severity=whenever -->')).toBe('normal')
  })
})

describe('pendingUpdate', () => {
  it('returns the newest release above the current version', () => {
    expect(pendingUpdate([rel('v0.3.7'), rel('v0.3.6'), rel('v0.3.5')], '0.3.5')).toEqual({
      version: '0.3.7', url: 'https://example.com/v0.3.7', severity: 'normal',
    })
  })

  it('keeps an urgent release that a later normal one would hide', () => {
    const releases = [rel('v0.3.7'), rel('v0.3.6', '<!-- vide-update: severity=urgent -->')]
    expect(pendingUpdate(releases, '0.3.5')).toMatchObject({ version: '0.3.7', severity: 'urgent' })
  })

  it('ignores the severity of releases already installed', () => {
    const releases = [rel('v0.3.7'), rel('v0.3.6', '<!-- vide-update: severity=critical -->')]
    expect(pendingUpdate(releases, '0.3.6')).toMatchObject({ version: '0.3.7', severity: 'normal' })
  })

  it('takes the highest severity among pending releases', () => {
    const releases = [
      rel('v0.3.8', '<!-- vide-update: severity=urgent -->'),
      rel('v0.3.7', '<!-- vide-update: severity=critical -->'),
    ]
    expect(pendingUpdate(releases, '0.3.5')?.severity).toBe('critical')
  })

  it('skips drafts and prereleases, severity included', () => {
    const releases = [
      rel('v0.4.0', '<!-- vide-update: severity=critical -->', { prerelease: true }),
      rel('v0.3.9', '', { draft: true }),
    ]
    expect(pendingUpdate(releases, '0.3.5')).toBeNull()
  })
})

describe('UpdateChecker', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports an update when the release tag is newer than the current version', async () => {
    mockFetchOnce([{ tag_name: 'v0.2.0', html_url: 'https://example.com/release', draft: false, prerelease: false }])
    const onUpdate = vi.fn()
    const checker = new UpdateChecker('0.1.0', onUpdate)
    await checker.check()
    expect(checker.getLatest()).toEqual({ version: '0.2.0', url: 'https://example.com/release', severity: 'normal' })
    expect(onUpdate).toHaveBeenCalledWith({ version: '0.2.0', url: 'https://example.com/release', severity: 'normal' })
  })

  it('does not report an update when the release is not newer', async () => {
    mockFetchOnce([{ tag_name: 'v0.1.0', html_url: 'https://example.com/release', draft: false, prerelease: false }])
    const onUpdate = vi.fn()
    const checker = new UpdateChecker('0.1.0', onUpdate)
    await checker.check()
    expect(checker.getLatest()).toBeNull()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('ignores draft and prerelease releases', async () => {
    mockFetchOnce([{ tag_name: 'v9.9.9', html_url: 'https://example.com/release', draft: true, prerelease: false }])
    const checker = new UpdateChecker('0.1.0')
    await checker.check()
    expect(checker.getLatest()).toBeNull()
  })

  it('only calls onUpdate when the detected version changes', async () => {
    mockFetchOnce([{ tag_name: 'v0.2.0', html_url: 'https://example.com/release', draft: false, prerelease: false }])
    const onUpdate = vi.fn()
    const checker = new UpdateChecker('0.1.0', onUpdate)
    await checker.check()
    await checker.check()
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('calls onUpdate again when only the severity changes', async () => {
    const onUpdate = vi.fn()
    const checker = new UpdateChecker('0.1.0', onUpdate)
    mockFetchOnce([rel('v0.2.0')])
    await checker.check()
    mockFetchOnce([rel('v0.2.0', '<!-- vide-update: severity=urgent -->')])
    await checker.check()
    expect(onUpdate).toHaveBeenCalledTimes(2)
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ version: '0.2.0', severity: 'urgent' }))
  })

  it('treats a response that is not a release list as a failed check', async () => {
    mockFetchOnce({ message: 'API rate limit exceeded' })
    const checker = new UpdateChecker('0.1.0')
    await expect(checker.check()).resolves.toBeNull()
    expect(checker.getStatus().failed).toBe(true)
  })

  it('swallows fetch errors without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const checker = new UpdateChecker('0.1.0')
    await expect(checker.check()).resolves.toBeNull()
    expect(checker.getLatest()).toBeNull()
  })

  it('swallows a non-ok response without throwing', async () => {
    mockFetchOnce({}, false)
    const checker = new UpdateChecker('0.1.0')
    await expect(checker.check()).resolves.toBeNull()
    expect(checker.getLatest()).toBeNull()
  })

  it('registerHandlers exposes update:getLatest returning the cached value', async () => {
    mockFetchOnce([{ tag_name: 'v0.2.0', html_url: 'https://example.com/release', draft: false, prerelease: false }])
    const checker = new UpdateChecker('0.1.0')
    checker.registerHandlers()
    await checker.check()
    expect(handlers['update:getLatest']()).toEqual({ version: '0.2.0', url: 'https://example.com/release', severity: 'normal' })
  })

  it('reports when it last reached GitHub, and whether the latest check failed', async () => {
    const checker = new UpdateChecker('0.1.0')
    expect(checker.getStatus()).toEqual({ latest: null, lastCheckedAt: null, failed: false })

    mockFetchOnce([{ tag_name: 'v0.1.0', html_url: 'x', draft: false, prerelease: false }])
    await checker.check()
    const ok = checker.getStatus()
    expect(ok.failed).toBe(false)
    expect(ok.lastCheckedAt).toEqual(expect.any(Number))

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await checker.check()
    // still remembers the last successful check
    expect(checker.getStatus()).toEqual({ latest: null, lastCheckedAt: ok.lastCheckedAt, failed: true })
  })

  it('update:check checks now and returns the status', async () => {
    mockFetchOnce([{ tag_name: 'v0.2.0', html_url: 'https://example.com/release', draft: false, prerelease: false }])
    const checker = new UpdateChecker('0.1.0')
    checker.registerHandlers()
    const status = await handlers['update:check']()
    expect(status).toMatchObject({ latest: { version: '0.2.0', url: 'https://example.com/release', severity: 'normal' }, failed: false })
    expect(handlers['update:getStatus']()).toEqual(status)
  })
})

