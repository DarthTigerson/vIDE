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
import { useModelSettingsStore } from '@/stores/modelSettingsStore'
import { useLlamaModelsStore, defaultLlamaModelConfig } from '@/stores/llamaModelsStore'
import { useFileStore } from '@/stores/fileStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useGraphifyStore } from '@/stores/graphifyStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import { usePanelRequestStore } from '@/stores/panelRequestStore'
import { useEditorSettingsStore } from '@/stores/editorSettingsStore'

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
  it('New Agent Session lists enabled agents and starts the picked one', async () => {
    const newSession = vi.fn()
    const setChatVisible = vi.fn()
    useClaudeStore.setState({ newSession, setChatVisible })
    useModelSettingsStore.setState({ enabled: { claude: true, bridge: true } })
    useLlamaModelsStore.setState({ models: [{ ...defaultLlamaModelConfig(), id: 'q1', displayName: 'Qwen', enabled: true }] })

    const step = await find('new-agent-session').pick!()
    expect(step.items.map((i) => i.label)).toEqual(['Claude Code', 'Bridge', 'Qwen'])
    step.onPick('llama:q1')
    expect(newSession).toHaveBeenCalledWith('/p', 'llama:q1')
    expect(setChatVisible).toHaveBeenCalledWith(true)
  })

  it('is greyed with no project open', () => {
    useFileStore.setState({ projectRoot: null })
    expect(find('new-agent-session').disabledReason?.()).toBe('Open a project first')
  })

  it('the old switch/new-session commands are gone', () => {
    const ids = panelCommands().map((c) => c.id)
    for (const gone of ['switch-to-claude', 'switch-to-bridge', 'claude-new-session', 'bridge-new-session']) {
      expect(ids).not.toContain(gone)
    }
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

describe('inline diff highlight', () => {
  it('offers Hide while on and Show while off, each flipping the setting', () => {
    useEditorSettingsStore.setState({ inlineDiffEnabled: true })
    expect(find('inline-diff-hide').condition?.()).toBe(true)
    expect(find('inline-diff-show').condition?.()).toBe(false)
    find('inline-diff-hide').action?.()
    expect(useEditorSettingsStore.getState().inlineDiffEnabled).toBe(false)
    expect(find('inline-diff-show').condition?.()).toBe(true)
    find('inline-diff-show').action?.()
    expect(useEditorSettingsStore.getState().inlineDiffEnabled).toBe(true)
  })
})
