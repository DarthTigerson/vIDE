import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { handlers, fsState, execFileMock, trashItemMock, openExternalMock } = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => unknown>,
  fsState: { files: new Map<string, string>() },
  execFileMock: vi.fn(),
  trashItemMock: vi.fn(),
  openExternalMock: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/fake/userData' },
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => unknown) => {
      handlers[channel] = fn
    },
  },
  shell: {
    trashItem: (...args: unknown[]) => trashItemMock(...args),
    openExternal: (...args: unknown[]) => openExternalMock(...args),
  },
}))

vi.mock('fs/promises', () => ({
  readFile: async (path: string) => {
    if (!fsState.files.has(path)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return fsState.files.get(path)!
  },
  writeFile: async (path: string, data: string) => {
    fsState.files.set(path, data)
  },
  mkdir: async () => {},
}))

vi.mock('child_process', () => ({
  execFile: (...args: unknown[]) => execFileMock(...args),
}))

import {
  getOnboardingStatus,
  markOnboardingComplete,
  resetOnboarding,
  detectCli,
  getGitIdentity,
  setGitIdentity,
  primeAutomationPermission,
  openAutomationSettings,
  registerOnboardingHandlers,
} from '../onboarding'

describe('onboarding status flag', () => {
  beforeEach(() => {
    fsState.files.clear()
  })

  it('reports not completed when no flag file exists yet', async () => {
    expect(await getOnboardingStatus()).toEqual({ completed: false })
  })

  it('reports completed after markOnboardingComplete()', async () => {
    await markOnboardingComplete()
    expect(await getOnboardingStatus()).toEqual({ completed: true })
  })

  it('resetOnboarding() flips a completed flag back to not-completed', async () => {
    await markOnboardingComplete()
    await resetOnboarding()
    expect(await getOnboardingStatus()).toEqual({ completed: false })
  })
})

describe('detectCli', () => {
  beforeEach(() => { execFileMock.mockReset() })

  it('resolves true when the login shell resolves an absolute path', async () => {
    execFileMock.mockImplementation((_shell, _args, cb) => cb(null, '/usr/local/bin/claude\n'))
    expect(await detectCli('claude')).toBe(true)
  })

  it('resolves false when the shell reports an error (command not found)', async () => {
    execFileMock.mockImplementation((_shell, _args, cb) => cb(new Error('not found'), ''))
    expect(await detectCli('some-nonexistent-cli')).toBe(false)
  })

  it('resolves false when stdout has no usable absolute path', async () => {
    execFileMock.mockImplementation((_shell, _args, cb) => cb(null, '\n'))
    expect(await detectCli('some-nonexistent-cli')).toBe(false)
  })
})

describe('git identity', () => {
  beforeEach(() => { execFileMock.mockReset() })

  it('returns nulls when git config has neither key set', async () => {
    execFileMock.mockImplementation((_bin, _args, cb) => cb(new Error('exit 1'), ''))
    expect(await getGitIdentity()).toEqual({ name: null, email: null })
  })

  it('returns the configured name/email when both are set', async () => {
    execFileMock.mockImplementation((_bin, args: string[], cb) => {
      const key = args[args.length - 1]
      if (key === 'user.name') return cb(null, 'Thomas Bonnici\n')
      if (key === 'user.email') return cb(null, 'thomas@example.com\n')
    })
    expect(await getGitIdentity()).toEqual({ name: 'Thomas Bonnici', email: 'thomas@example.com' })
  })

  it('setGitIdentity writes both user.name and user.email via git config --global', async () => {
    execFileMock.mockImplementation((_bin, _args, cb) => cb(null, ''))
    await setGitIdentity('Thomas', 'thomas@example.com')
    const calls = execFileMock.mock.calls.map((c) => c[1])
    expect(calls).toContainEqual(['config', '--global', 'user.name', 'Thomas'])
    expect(calls).toContainEqual(['config', '--global', 'user.email', 'thomas@example.com'])
  })
})

describe('primeAutomationPermission', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    trashItemMock.mockReset()
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('short-circuits to true on non-macOS without calling shell.trashItem', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    expect(await primeAutomationPermission()).toBe(true)
    expect(trashItemMock).not.toHaveBeenCalled()
  })

  it('resolves true on macOS when shell.trashItem succeeds', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    trashItemMock.mockResolvedValue(undefined)
    expect(await primeAutomationPermission()).toBe(true)
    expect(trashItemMock).toHaveBeenCalled()
  })

  it('resolves false on macOS when shell.trashItem rejects (denied or dismissed)', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    trashItemMock.mockRejectedValue(new Error('denied'))
    expect(await primeAutomationPermission()).toBe(false)
  })
})

describe('openAutomationSettings', () => {
  it('opens the macOS Automation privacy pane', () => {
    openAutomationSettings()
    expect(openExternalMock).toHaveBeenCalledWith('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation')
  })
})

describe('registerOnboardingHandlers', () => {
  it('registers all onboarding IPC channels', () => {
    registerOnboardingHandlers()
    expect(Object.keys(handlers)).toEqual(
      expect.arrayContaining([
        'onboarding:getStatus',
        'onboarding:markComplete',
        'onboarding:reset',
        'onboarding:detectCli',
        'onboarding:getGitIdentity',
        'onboarding:setGitIdentity',
        'onboarding:primeAutomationPermission',
        'onboarding:openAutomationSettings',
      ])
    )
  })
})
