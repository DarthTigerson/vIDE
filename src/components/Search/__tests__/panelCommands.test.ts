import { describe, it, expect, beforeEach, vi } from 'vitest'

// Some stores read localStorage at import time, and this suite runs in node.
vi.hoisted(() => {
  const data = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
})

vi.mock('@/lib/platform', () => ({ isMac: true }))
vi.mock('@/lib/openBrowserTab', () => ({ openNewBrowserTab: vi.fn() }))

import { panelCommands } from '../panelCommands'
import { openNewBrowserTab } from '@/lib/openBrowserTab'
import { useClaudeStore } from '@/stores/claudeStore'
import { useBridgeStore } from '@/stores/bridgeStore'
import { useFileStore } from '@/stores/fileStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGraphifyStore } from '@/stores/graphifyStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { usePanelRequestStore } from '@/stores/panelRequestStore'

const find = (id: string) => {
  const cmd = panelCommands().find((c) => c.id === id)
  if (!cmd) throw new Error(`missing command ${id}`)
  return cmd
}

beforeEach(() => {
  useFileStore.setState({ projectRoot: '/p' })
  useGitReposStore.setState({ selectedRepo: '/p/repo' })
  usePanelRequestStore.setState({ request: null })
})

describe('sessions', () => {
  it('Claude: New Session switches to Claude, starts a session and shows the chat', () => {
    const setAssistant = vi.fn()
    const newSession = vi.fn()
    const setChatVisible = vi.fn()
    useClaudeStore.setState({ assistant: 'bridge', setAssistant, newSession, setChatVisible })
    find('claude-new-session').action?.()
    expect(setAssistant).toHaveBeenCalledWith('claude')
    expect(newSession).toHaveBeenCalledWith('/p')
    expect(setChatVisible).toHaveBeenCalledWith(true)
  })

  it('Bridge: New Session switches to Bridge and starts a session', () => {
    const setAssistant = vi.fn()
    const newSession = vi.fn()
    useClaudeStore.setState({ assistant: 'claude', setAssistant, setChatVisible: vi.fn() })
    useBridgeStore.setState({ newSession })
    find('bridge-new-session').action?.()
    expect(setAssistant).toHaveBeenCalledWith('bridge')
    expect(newSession).toHaveBeenCalled()
  })

  it('both are greyed with no project open', () => {
    useFileStore.setState({ projectRoot: null })
    expect(find('claude-new-session').disabledReason?.()).toBe('Open a project first')
    expect(find('bridge-new-session').disabledReason?.()).toBe('Open a project first')
  })
})

describe('Browser: New Tab', () => {
  it('opens a browser tab', () => {
    find('browser-new-tab').action?.()
    expect(openNewBrowserTab).toHaveBeenCalled()
  })
})

describe('Graphify: Rebuild', () => {
  const run = vi.fn()
  beforeEach(() => {
    run.mockClear()
    useGraphifySettingsStore.setState({ enabled: true })
    useGraphifyStore.setState({ available: true, running: false, run })
  })

  it('runs graphify for the selected repo and shows the Graphify panel', () => {
    expect(find('graphify-rebuild').disabledReason?.()).toBeNull()
    find('graphify-rebuild').action?.()
    expect(run).toHaveBeenCalledWith('/p/repo')
    expect(usePanelRequestStore.getState().request?.panel).toBe('graphify')
  })

  it('falls back to the project root when no repo is selected', () => {
    useGitReposStore.setState({ selectedRepo: null })
    find('graphify-rebuild').action?.()
    expect(run).toHaveBeenCalledWith('/p')
  })

  it.each([
    [{ enabled: false }, {}, 'Enable Graphify in Settings'],
    [{}, { available: false }, 'graphify is not installed'],
    [{}, { running: true }, 'A graphify build is already running'],
  ])('is greyed with a reason (%j / %j)', (settings, graphify, reason) => {
    useGraphifySettingsStore.setState(settings as object)
    useGraphifyStore.setState(graphify as object)
    expect(find('graphify-rebuild').disabledReason?.()).toBe(reason)
  })
})
