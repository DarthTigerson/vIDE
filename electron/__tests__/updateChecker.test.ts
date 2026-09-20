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

import { UpdateChecker, compareVersions } from '../updateChecker'

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

describe('UpdateChecker', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports an update when the release tag is newer than the current version', async () => {
    mockFetchOnce({ tag_name: 'v0.2.0', html_url: 'https://example.com/release', draft: false, prerelease: false })
    const onUpdate = vi.fn()
    const checker = new UpdateChecker('0.1.0', onUpdate)
    await checker.check()
    expect(checker.getLatest()).toEqual({ version: '0.2.0', url: 'https://example.com/release' })
    expect(onUpdate).toHaveBeenCalledWith({ version: '0.2.0', url: 'https://example.com/release' })
  })

  it('does not report an update when the release is not newer', async () => {
    mockFetchOnce({ tag_name: 'v0.1.0', html_url: 'https://example.com/release', draft: false, prerelease: false })
    const onUpdate = vi.fn()
    const checker = new UpdateChecker('0.1.0', onUpdate)
    await checker.check()
    expect(checker.getLatest()).toBeNull()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('ignores draft and prerelease releases', async () => {
    mockFetchOnce({ tag_name: 'v9.9.9', html_url: 'https://example.com/release', draft: true, prerelease: false })
    const checker = new UpdateChecker('0.1.0')
    await checker.check()
    expect(checker.getLatest()).toBeNull()
  })

  it('only calls onUpdate when the detected version changes', async () => {
    mockFetchOnce({ tag_name: 'v0.2.0', html_url: 'https://example.com/release', draft: false, prerelease: false })
    const onUpdate = vi.fn()
    const checker = new UpdateChecker('0.1.0', onUpdate)
    await checker.check()
    await checker.check()
    expect(onUpdate).toHaveBeenCalledTimes(1)
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
    mockFetchOnce({ tag_name: 'v0.2.0', html_url: 'https://example.com/release', draft: false, prerelease: false })
    const checker = new UpdateChecker('0.1.0')
    checker.registerHandlers()
    await checker.check()
    expect(handlers['update:getLatest']()).toEqual({ version: '0.2.0', url: 'https://example.com/release' })
  })
})
