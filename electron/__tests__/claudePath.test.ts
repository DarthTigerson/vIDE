import { describe, it, expect, vi, beforeEach } from 'vitest'

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }))

vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}))

import { resolveClaudePath, _resetClaudePathCacheForTesting } from '../claudePath'

describe('resolveClaudePath', () => {
  beforeEach(() => {
    execFileMock.mockReset()
    _resetClaudePathCacheForTesting()
  })

  it('resolves the absolute path via a login shell', async () => {
    execFileMock.mockImplementation((_shell, _args, cb) => cb(null, '/Users/thomas/.local/bin/claude\n', ''))

    expect(await resolveClaudePath()).toBe('/Users/thomas/.local/bin/claude')
  })

  it('caches the result across calls (only resolves once)', async () => {
    execFileMock.mockImplementation((_shell, _args, cb) => cb(null, '/usr/local/bin/claude', ''))

    await resolveClaudePath()
    await resolveClaudePath()

    expect(execFileMock).toHaveBeenCalledTimes(1)
  })

  it('returns null when the shell command errors', async () => {
    execFileMock.mockImplementation((_shell, _args, cb) => cb(new Error('not found'), '', ''))

    expect(await resolveClaudePath()).toBeNull()
  })

  it('returns null when stdout is empty', async () => {
    execFileMock.mockImplementation((_shell, _args, cb) => cb(null, '', ''))

    expect(await resolveClaudePath()).toBeNull()
  })

  it('takes the last non-empty line of stdout, ignoring banner/preamble output', async () => {
    execFileMock.mockImplementation((_shell, _args, cb) =>
      cb(null, 'some banner text\n/usr/local/bin/claude\n', '')
    )

    expect(await resolveClaudePath()).toBe('/usr/local/bin/claude')
  })

  it('returns null when the resolved line is not an absolute path', async () => {
    execFileMock.mockImplementation((_shell, _args, cb) => cb(null, 'claude\n', ''))

    expect(await resolveClaudePath()).toBeNull()
  })

  it('does not cache a failed resolution, so the next call retries', async () => {
    execFileMock.mockImplementation((_shell, _args, cb) => cb(new Error('not found'), '', ''))

    expect(await resolveClaudePath()).toBeNull()
    expect(await resolveClaudePath()).toBeNull()

    expect(execFileMock).toHaveBeenCalledTimes(2)
  })

  it('shares a single in-flight resolution across concurrent callers (no await between calls)', async () => {
    execFileMock.mockImplementation((_shell, _args, cb) => cb(null, '/usr/local/bin/claude', ''))

    const first = resolveClaudePath()
    const second = resolveClaudePath()

    expect(await first).toBe('/usr/local/bin/claude')
    expect(await second).toBe('/usr/local/bin/claude')
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })
})
