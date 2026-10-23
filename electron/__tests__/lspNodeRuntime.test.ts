import { describe, it, expect, vi, beforeEach } from 'vitest'

const { resolveBinaryPathMock, runStreamedMock, existsSyncMock } = vi.hoisted(() => ({
  resolveBinaryPathMock: vi.fn(),
  runStreamedMock: vi.fn(),
  existsSyncMock: vi.fn(),
}))

vi.mock('../lsp/shellPath', () => ({
  resolveBinaryPath: (...a: unknown[]) => resolveBinaryPathMock(...a),
  runStreamed: (...a: unknown[]) => runStreamedMock(...a),
}))
vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  existsSync: (p: string) => existsSyncMock(p),
}))
vi.mock('os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('os')>()),
  platform: () => 'darwin',
  arch: () => 'arm64',
}))
vi.mock('../lsp/download', () => ({
  download: () => Promise.reject(new Error('offline')),
}))

import { NODE_REQUIRED, ensureNpm, npmInstallGlobal } from '../lsp/nodeRuntime'

beforeEach(() => {
  resolveBinaryPathMock.mockReset().mockResolvedValue(null)
  runStreamedMock.mockReset().mockResolvedValue(undefined)
  existsSyncMock.mockReset().mockReturnValue(false)
})

describe('ensureNpm', () => {
  it('uses npm from PATH without installing anything', async () => {
    resolveBinaryPathMock.mockImplementation(async (c: string) => (c === 'npm' ? '/usr/local/bin/npm' : null))
    await npmInstallGlobal(['pyright'], () => {})
    expect(runStreamedMock).toHaveBeenCalledTimes(1)
    expect(runStreamedMock).toHaveBeenCalledWith('/usr/local/bin/npm', ['install', '-g', 'pyright'], expect.any(Function), 'npm')
  })

  it('installs Node.js with Homebrew when npm is missing and the download fails', async () => {
    resolveBinaryPathMock.mockImplementation(async (c: string) => (c === 'brew' ? '/opt/homebrew/bin/brew' : null))
    runStreamedMock.mockImplementation(async (bin: string) => {
      if (bin.endsWith('brew')) existsSyncMock.mockImplementation((p: string) => p === '/opt/homebrew/bin/npm')
    })
    await expect(ensureNpm(() => {})).resolves.toBe('/opt/homebrew/bin/npm')
    expect(runStreamedMock.mock.calls[0].slice(0, 2)).toEqual(['/opt/homebrew/bin/brew', ['install', 'node']])
  })

  it('tries the download, then Homebrew, then asks for Node.js', async () => {
    const log: string[] = []
    await expect(ensureNpm((c) => log.push(c))).rejects.toThrow(NODE_REQUIRED)
    expect(log.indexOf('offline\n')).toBeLessThan(log.indexOf('Homebrew is not installed.\n'))
    expect(log.indexOf('offline\n')).toBeGreaterThanOrEqual(0)
    expect(runStreamedMock).not.toHaveBeenCalled()
  })

  it('moves on when the Homebrew install fails', async () => {
    resolveBinaryPathMock.mockImplementation(async (c: string) => (c === 'brew' ? '/opt/homebrew/bin/brew' : null))
    runStreamedMock.mockRejectedValue(new Error('brew exited with code 1'))
    const log: string[] = []
    await expect(ensureNpm((c) => log.push(c))).rejects.toThrow(NODE_REQUIRED)
    expect(log).toEqual(expect.arrayContaining(['brew exited with code 1\n', 'offline\n']))
  })
})
