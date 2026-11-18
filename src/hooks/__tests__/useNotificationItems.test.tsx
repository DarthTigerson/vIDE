import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNotificationItems } from '../useNotificationItems'
import { useUsageAlertStore } from '@/stores/usageAlertStore'
import { useUpdateStore } from '@/stores/updateStore'
import { useGitStore, emptyRepoGitState } from '@/stores/gitStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGitPanelOpenAlertStore } from '@/stores/gitPanelOpenAlertStore'
import { useLlamaSettingsStore } from '@/stores/llamaSettingsStore'
import { useLlamaStore } from '@/stores/llamaStore'
import { usePanelRequestStore } from '@/stores/panelRequestStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { useGraphifyStore } from '@/stores/graphifyStore'
import { useStoreStore } from '@/stores/storeStore'
import { useEditorStore } from '@/stores/editorStore'
import { useAppContribStore } from '@/apps/appContribStore'
import type { RegistryState } from '@/types/api'

beforeEach(() => {
  useUsageAlertStore.setState({ alerts: [] })
  useUpdateStore.setState({ available: null, status: 'idle', snoozedVersion: null })
  useGitStore.setState({ repos: {} })
  useGitReposStore.setState({ selectedRepo: null, hasExplicitSelection: false })
  useGitPanelOpenAlertStore.setState({ openRequest: 0 })
  useLlamaSettingsStore.setState({ enabled: false })
  useLlamaStore.setState({ available: null })
  usePanelRequestStore.setState({ request: null })
  useGraphifySettingsStore.setState({ enabled: false, gitignorePrompt: true, claudeSkillPrompt: true })
  useGraphifyStore.setState({ gitignorePrompts: {}, claudeSkillPrompts: {}, installingSkill: null })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useNotificationItems', () => {
  it('returns an empty list when nothing is active', () => {
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current).toEqual([])
  })

  it('includes a session usage item projected to run out, with a live countdown to the cutoff', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 14, 0, 0))
    useUsageAlertStore.setState({
      alerts: [{ scope: 'session', cutoffAt: new Date(2026, 0, 1, 16, 0, 0).getTime(), resetAt: null }],
    })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current).toHaveLength(1)
    expect(result.current[0].id).toBe('usage-session')
    expect(result.current[0].text).toBe('Session usage may run out in 02:00:00')
    expect(result.current[0].icon).toBeTruthy()
  })

  it('labels a weekly cutoff as "Weekly usage"', () => {
    useUsageAlertStore.setState({ alerts: [{ scope: 'week', cutoffAt: Date.now() + 1000, resetAt: null }] })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current[0].id).toBe('usage-week')
    expect(result.current[0].text).toMatch(/^Weekly usage may run out/)
  })

  it('includes both session and weekly items when both windows are at risk', () => {
    useUsageAlertStore.setState({
      alerts: [
        { scope: 'week', cutoffAt: Date.now() + 1000, resetAt: null },
        { scope: 'session', cutoffAt: Date.now() + 5000, resetAt: null },
      ],
    })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current.map((i) => i.id)).toEqual(['usage-week', 'usage-session'])
  })

  it('switches to a reset countdown once the cutoff has actually passed', () => {
    vi.useFakeTimers()
    const now = new Date(2026, 0, 1, 14, 0, 0)
    vi.setSystemTime(now)
    useUsageAlertStore.setState({
      alerts: [{ scope: 'session', cutoffAt: now.getTime() - 1000, resetAt: new Date(2026, 0, 1, 18, 0, 0).getTime() }],
    })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current[0].text).toBe('Session usage ran out — resets in 04:00:00')
  })

  it('drops the reset countdown when no reset time is known', () => {
    vi.useFakeTimers()
    const now = new Date(2026, 0, 1, 14, 0, 0)
    vi.setSystemTime(now)
    useUsageAlertStore.setState({
      alerts: [{ scope: 'session', cutoffAt: now.getTime() - 1000, resetAt: null }],
    })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current[0].text).toBe('Session usage ran out')
  })

  it('pins an update-available item whose Update button starts the update and whose row opens the Update page', () => {
    const startUpdate = vi.fn()
    const openUpdatePage = vi.fn()
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com', severity: 'normal' as const }, status: 'idle', startUpdate, openUpdatePage })
    const { result } = renderHook(() => useNotificationItems())
    const update = result.current.find((i) => i.id === 'update')!
    expect(update.text).toBe('vIDE v0.2.0 is available')
    expect(update.icon).toBeTruthy()
    expect(update).toMatchObject({ pinned: true, urgent: false, secondaryAction: undefined })
    act(() => update.action!.onClick())
    expect(startUpdate).toHaveBeenCalled()
    act(() => update.onClick!())
    expect(openUpdatePage).toHaveBeenCalled()
  })

  it('an urgent update is red, offers Snooze, and disappears while snoozed', () => {
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com', severity: 'urgent' as const }, status: 'idle' })
    const { result, rerender } = renderHook(() => useNotificationItems())
    const update = result.current.find((i) => i.id === 'update')!
    expect(update.text).toBe('Security update: vIDE v0.2.0')
    expect(update).toMatchObject({ pinned: true, urgent: true })
    expect(update.secondaryAction?.label).toBe('Snooze')
    act(() => update.secondaryAction!.onClick())
    rerender()
    expect(result.current.find((i) => i.id === 'update')).toBeUndefined()
  })

  it('a critical update reads as critical in the row', () => {
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com', severity: 'critical' as const }, status: 'idle' })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current.find((i) => i.id === 'update')!.text).toBe('Critical security update: vIDE v0.2.0')
  })

  it('a snooze for an older version does not hide a newer release', () => {
    useUpdateStore.setState({ available: { version: '0.3.0', url: 'https://example.com', severity: 'urgent' as const }, status: 'idle', snoozedVersion: '0.2.0' })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current.find((i) => i.id === 'update')).toBeDefined()
  })

  it('while an update is in progress, the item reopens the Update page to watch it', () => {
    const openUpdatePage = vi.fn()
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com', severity: 'normal' as const }, status: 'updating', openUpdatePage })
    const { result } = renderHook(() => useNotificationItems())
    const update = result.current.find((i) => i.id === 'update')
    expect(update?.text).toBe('Updating vIDE…')
    expect(update?.disabled).toBe(false)
    expect(update).toMatchObject({ pinned: false, action: undefined })
    act(() => update!.onClick!())
    expect(openUpdatePage).toHaveBeenCalled()
  })

  it('includes a commit-error item for a repo whose commit failed, and its action selects the repo and requests the panel to open', () => {
    useGitStore.setState({
      repos: { '/repo/one': { ...emptyRepoGitState, commitError: 'hook failed' } },
    })
    const { result } = renderHook(() => useNotificationItems())
    const item = result.current.find((i) => i.id === 'commit-error-/repo/one')
    expect(item?.text).toBe('Commit failed in one: hook failed')
    expect(item?.icon).toBeTruthy()
    act(() => item!.onClick!())
    expect(useGitReposStore.getState().selectedRepo).toBe('/repo/one')
    expect(useGitPanelOpenAlertStore.getState().openRequest).toBe(1)
  })

  it('includes one commit-error item per repo with a commit error', () => {
    useGitStore.setState({
      repos: {
        '/repo/one': { ...emptyRepoGitState, commitError: 'first error' },
        '/repo/two': { ...emptyRepoGitState, commitError: 'second error' },
        '/repo/three': { ...emptyRepoGitState, commitError: null },
      },
    })
    const { result } = renderHook(() => useNotificationItems())
    const ids = result.current.map((i) => i.id)
    expect(ids).toContain('commit-error-/repo/one')
    expect(ids).toContain('commit-error-/repo/two')
    expect(ids).not.toContain('commit-error-/repo/three')
  })

  it('is silent about a repo with no commit error', () => {
    useGitStore.setState({ repos: { '/repo/one': { ...emptyRepoGitState, commitError: null } } })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current.find((i) => i.id.startsWith('commit-error-'))).toBeUndefined()
  })

  it('includes a commit-message-error item when generating a message failed, and its action selects the repo and requests the panel to open', () => {
    useGitStore.setState({
      repos: { '/repo/one': { ...emptyRepoGitState, commitMessageError: 'Could not generate a commit message' } },
    })
    const { result } = renderHook(() => useNotificationItems())
    const item = result.current.find((i) => i.id === 'commit-message-error-/repo/one')
    expect(item?.text).toBe('Could not generate a commit message in one')
    expect(item?.icon).toBeTruthy()
    act(() => item!.onClick!())
    expect(useGitReposStore.getState().selectedRepo).toBe('/repo/one')
    expect(useGitPanelOpenAlertStore.getState().openRequest).toBe(1)
  })

  it('includes one commit-message-error item per affected repo only', () => {
    useGitStore.setState({
      repos: {
        '/repo/one': { ...emptyRepoGitState, commitMessageError: 'x' },
        '/repo/two': { ...emptyRepoGitState, commitMessageError: 'x' },
        '/repo/three': { ...emptyRepoGitState, commitMessageError: null },
      },
    })
    const { result } = renderHook(() => useNotificationItems())
    const ids = result.current.map((i) => i.id)
    expect(ids).toContain('commit-message-error-/repo/one')
    expect(ids).toContain('commit-message-error-/repo/two')
    expect(ids).not.toContain('commit-message-error-/repo/three')
  })

  it('a commit error and a generation error in the same repo are separate rows', () => {
    useGitStore.setState({
      repos: { '/repo/one': { ...emptyRepoGitState, commitError: 'hook failed', commitMessageError: 'x' } },
    })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current.map((i) => i.id)).toEqual(['commit-error-/repo/one', 'commit-message-error-/repo/one'])
  })

  it("includes a llama item when the Llama feature is on but llama.cpp isn't installed, and its action opens the Llama panel (VIDE-110)", () => {
    useLlamaSettingsStore.setState({ enabled: true })
    useLlamaStore.setState({ available: false })
    const { result } = renderHook(() => useNotificationItems())
    const item = result.current.find((i) => i.id === 'llama-unavailable')
    expect(item?.text).toBe("llama.cpp isn't installed")
    expect(item?.disabled).toBe(false)
    expect(item?.icon).toBeTruthy()
    act(() => item!.onClick!())
    expect(usePanelRequestStore.getState().request?.panel).toBe('llama')
  })

  it('stays silent about llama.cpp while availability is still unknown', () => {
    useLlamaSettingsStore.setState({ enabled: true })
    useLlamaStore.setState({ available: null })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current.find((i) => i.id === 'llama-unavailable')).toBeUndefined()
  })

  it('stays silent when llama.cpp is installed', () => {
    useLlamaSettingsStore.setState({ enabled: true })
    useLlamaStore.setState({ available: true })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current.find((i) => i.id === 'llama-unavailable')).toBeUndefined()
  })

  it('stays silent when the Llama feature is switched off, even though llama.cpp is missing', () => {
    useLlamaSettingsStore.setState({ enabled: false })
    useLlamaStore.setState({ available: false })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current.find((i) => i.id === 'llama-unavailable')).toBeUndefined()
  })

  it('orders the llama item before the update item', () => {
    useLlamaSettingsStore.setState({ enabled: true })
    useLlamaStore.setState({ available: false })
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com', severity: 'normal' as const }, status: 'idle' })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current.map((i) => i.id)).toEqual(['llama-unavailable', 'update'])
  })

  it('orders usage before update', () => {
    useUsageAlertStore.setState({ alerts: [{ scope: 'session', cutoffAt: Date.now() + 1000, resetAt: null }] })
    useUpdateStore.setState({ available: { version: '0.2.0', url: 'https://example.com', severity: 'normal' as const }, status: 'idle' })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current.map((i) => i.id)).toEqual(['usage-session', 'update'])
  })
  it('prompts to gitignore graphify-out, adding it on click', () => {
    const addToGitignore = vi.fn()
    useGraphifySettingsStore.setState({ enabled: true })
    useGraphifyStore.setState({ gitignorePrompts: { '/code/app': null }, addToGitignore })
    const { result } = renderHook(() => useNotificationItems())
    const item = result.current.find((i) => i.id === 'graphify-gitignore-/code/app')
    expect(item?.text).toBe("graphify-out/ isn't in app's .gitignore — click to add it")
    act(() => item!.onClick!())
    expect(addToGitignore).toHaveBeenCalledWith('/code/app')
  })

  it('shows why adding graphify-out to .gitignore failed', () => {
    useGraphifySettingsStore.setState({ enabled: true })
    useGraphifyStore.setState({ gitignorePrompts: { '/code/app': 'EACCES' } })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current[0].text).toBe("Couldn't add graphify-out/ to .gitignore in app: EACCES")
  })

  it('stays silent about graphify-out when Graphify is switched off', () => {
    useGraphifyStore.setState({ gitignorePrompts: { '/code/app': null } })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current).toEqual([])
  })
  it('stays silent about graphify-out when the gitignore reminder is switched off', () => {
    useGraphifySettingsStore.setState({ enabled: true, gitignorePrompt: false })
    useGraphifyStore.setState({ gitignorePrompts: { '/code/app': null } })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current).toEqual([])
  })
  it('prompts to set up graphify for Claude Code, installing the skill on click', () => {
    const installClaudeSkill = vi.fn()
    useGraphifySettingsStore.setState({ enabled: true })
    useGraphifyStore.setState({ claudeSkillPrompts: { '/code/app': null }, installClaudeSkill })
    const { result } = renderHook(() => useNotificationItems())
    const item = result.current.find((i) => i.id === 'graphify-claude-skill-/code/app')
    expect(item?.text).toBe("Claude Code isn't using graphify in app — click to set it up")
    act(() => item!.onClick!())
    expect(installClaudeSkill).toHaveBeenCalledWith('/code/app')
  })

  it('disables the Claude Code setup row while its install runs', () => {
    useGraphifySettingsStore.setState({ enabled: true })
    useGraphifyStore.setState({ claudeSkillPrompts: { '/code/app': null }, installingSkill: '/code/app' })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current[0]).toMatchObject({ text: 'Setting up graphify for Claude Code in app…', disabled: true })
  })

  it('stays silent about Claude Code setup when its reminder is switched off', () => {
    useGraphifySettingsStore.setState({ enabled: true, claudeSkillPrompt: false })
    useGraphifyStore.setState({ claudeSkillPrompts: { '/code/app': null } })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current).toEqual([])
  })
})

describe('store update notices', () => {
  const registry: RegistryState = {
    status: 'ok', checkedAt: 1, fromCache: false,
    apps: [{
      id: 'docker', name: 'Docker', description: 'd', repo: 'o/r', firstParty: true, compatible: true,
      recommended: false, category: 'applications', targets: ['vide'],
      latest: { version: '1.1.0', commit: 'a'.repeat(40), url: 'u', sha256: 'b'.repeat(64), minVide: '0.4.0' },
    }],
    languageServers: [],
  }
  const installedDocker = { id: 'docker', name: 'Docker', version: '1.0.0', source: 'store' as const, rendererUrl: '', hasMain: false, contributes: {}, status: 'loaded' as const }

  it('adds one row per pending update; click installs, dismiss persists the version', () => {
    const install = vi.fn()
    const dismissUpdate = vi.fn()
    useStoreStore.setState({ registry, dismissedUpdates: [], install, dismissUpdate })
    useAppContribStore.setState({ apps: [installedDocker] })
    const { result } = renderHook(() => useNotificationItems())
    const item = result.current.find((i) => i.id === 'store-update-docker-1.1.0')!
    expect(item.text).toBe('Docker 1.1.0 is available')
    item.onClick?.()
    expect(install).toHaveBeenCalledWith('docker')
    item.onDismiss?.()
    expect(dismissUpdate).toHaveBeenCalledWith('store-update-docker-1.1.0')
  })

  it('turns the row into a failure line when the install errored', () => {
    useStoreStore.setState({ registry, dismissedUpdates: [], errors: { docker: 'Checksum mismatch' } })
    useAppContribStore.setState({ apps: [installedDocker] })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current.find((i) => i.id === 'store-update-docker-1.1.0')!.text).toBe("Couldn't update Docker: Checksum mismatch")
    useStoreStore.setState({ errors: {} })
  })

  it('hides a dismissed version', () => {
    useStoreStore.setState({ registry, dismissedUpdates: ['store-update-docker-1.1.0'] })
    useAppContribStore.setState({ apps: [installedDocker] })
    const { result } = renderHook(() => useNotificationItems())
    expect(result.current.some((i) => i.id.startsWith('store-update-'))).toBe(false)
  })

  describe('install result items', () => {
    beforeEach(() => {
      useStoreStore.setState({ registry, events: [{ id: 'store-event-1', text: 'Installed Docker 1.1.0', appId: 'docker' }] })
    })
    afterEach(() => { useStoreStore.setState({ events: [] }); useAppContribStore.setState({ apps: [] }) })

    it("click opens the app's Store page", () => {
      const openTab = vi.fn()
      useEditorStore.setState({ openTab } as never)
      const { result } = renderHook(() => useNotificationItems())
      result.current.find((i) => i.id === 'store-event-1')!.onClick?.()
      expect(openTab).toHaveBeenCalledWith({ path: 'store://app/docker', content: '', dirty: false })
    })

    it('offers Restart vIDE only while the update is waiting on a restart', () => {
      ;(window as any).api = { ...(window as any).api, appsRestart: vi.fn().mockResolvedValue(undefined) }
      useAppContribStore.setState({ apps: [{ ...installedDocker, version: '1.1.0', status: 'loaded' }] })
      const { result, rerender } = renderHook(() => useNotificationItems())
      expect(result.current.find((i) => i.id === 'store-event-1')!.action).toBeUndefined()
      act(() => { useAppContribStore.setState({ apps: [{ ...installedDocker, version: '1.1.0', hasMain: true, status: 'restart-required' }] }) })
      rerender()
      const action = result.current.find((i) => i.id === 'store-event-1')!.action!
      expect(action.label).toBe('Restart vIDE')
      action.onClick()
      expect((window as any).api.appsRestart).toHaveBeenCalled()
    })
  })

  describe('moved-to-Store notice', () => {
    beforeEach(() => {
      localStorage.clear()
      useStoreStore.setState({ registry: null, movedNoticeDismissed: false, movedNoticeOpen: false })
      useAppContribStore.setState({ apps: [] })
    })
    const moved: RegistryState = {
      status: 'ok', checkedAt: 1, fromCache: false,
      apps: [{ ...(registry as Extract<RegistryState, { status: 'ok' }>).apps[0], replacesBuiltIn: 'docker' }],
      languageServers: [],
    }

    it('shows one row when the built-in was enabled and the app is not installed; click opens the modal', () => {
      localStorage.setItem('vide:docker:enabled', 'true')
      useStoreStore.setState({ registry: moved })
      const { result } = renderHook(() => useNotificationItems())
      const item = result.current.find((i) => i.id === 'store-moved-apps')!
      expect(item.text).toBe('Some apps moved to the Store')
      item.onClick?.()
      expect(useStoreStore.getState().movedNoticeOpen).toBe(true)
      item.onDismiss?.()
      expect(useStoreStore.getState().movedNoticeDismissed).toBe(true)
      expect(localStorage.getItem('vide:store:movedNoticeDismissed')).toBe('true')
    })

    it('stays silent when the built-in was not enabled', () => {
      useStoreStore.setState({ registry: moved })
      const { result } = renderHook(() => useNotificationItems())
      expect(result.current.some((i) => i.id === 'store-moved-apps')).toBe(false)
    })
  })
})
