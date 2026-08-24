import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { Terminal as XTerm } from '@xterm/xterm'
import { Chat } from '../Chat'
import { useFileStore } from '@/stores/fileStore'
import { useClaudeStore } from '@/stores/claudeStore'
import { useEditorStore } from '@/stores/editorStore'
import { useBrowserStore } from '@/stores/browserStore'

// Diagnostic/regression test: exercises the REAL link provider Chat.tsx
// registers on a REAL xterm buffer, rather than just the pure regex/parse
// helpers in terminalLinks.test.ts — catches wiring bugs (wrong regex passed
// to the wrong provider, provider never registered, etc.) that unit-testing
// FILE_PATH_REGEX in isolation can't.
describe('Chat terminal link provider (integration)', () => {
  let assistantDataCallback: ((source: string, data: string) => void) | null = null

  beforeEach(() => {
    assistantDataCallback = null
    ;(global as any).window.api = {
      ...(global as any).window.api,
      assistantSpawn: vi.fn(),
      assistantWrite: vi.fn(),
      assistantResize: vi.fn(),
      onAssistantData: vi.fn((cb: (source: string, data: string) => void) => {
        assistantDataCallback = cb
        return () => {}
      }),
      pathExists: vi.fn().mockResolvedValue(false),
      getHomeDir: vi.fn().mockResolvedValue('/Users/thomas'),
    }
    useFileStore.setState({ projectRoot: '/project' })
    useClaudeStore.setState({ assistant: 'claude', restartToken: 0, pendingInjection: null, focusToken: 0 })
  })

  afterEach(() => {
    cleanup()
    useFileStore.setState({ projectRoot: null })
    vi.restoreAllMocks()
  })

  // Renders Chat, captures the two providers it registers for 'claude', and
  // feeds `line` through the exact same path real PTY output takes (into the
  // SAME xterm instance the providers close over — writing into a
  // separately-constructed XTerm would test nothing).
  async function setupAndWriteLine(line: string) {
    const registered: any[] = []
    const spy = vi.spyOn(XTerm.prototype, 'registerLinkProvider').mockImplementation(function (
      this: any,
      provider: any
    ) {
      registered.push(provider)
      return { dispose: () => {} }
    })

    const { container } = render(<Chat />)
    await waitFor(() => {
      if (!container.querySelector('.xterm-helper-textarea')) throw new Error('terminal not mounted yet')
    })

    // Chat.tsx registers exactly two providers for 'claude': the URL one
    // (first, default regex) and the file-path one (second, FILE_PATH_REGEX).
    expect(registered.length).toBe(2)
    const filePathProvider = registered[1]

    expect(assistantDataCallback).not.toBeNull()
    await new Promise<void>((resolve) => {
      assistantDataCallback!('claude', `${line}\r\n`)
      // xterm.write() parses the written data asynchronously; give it a tick.
      setTimeout(resolve, 50)
    })

    const links = await new Promise<any[]>((resolve) => {
      filePathProvider.provideLinks(1, (result: any[] | undefined) => resolve(result ?? []))
    })

    return { links, spy }
  }

  it('registers a link provider that detects an extensionless SSH-key path in real terminal buffer content', async () => {
    const { links, spy } = await setupAndWriteLine('~/.ssh/id_ed25519_github_personal')

    expect(links.length).toBeGreaterThan(0)
    expect(links[0].text).toBe('~/.ssh/id_ed25519_github_personal')

    // Closes the loop on the reported symptom end-to-end: activating the
    // link (as a real click would) must resolve the ~/ against the actual
    // home directory and check for the file — not silently no-op.
    await links[0].activate(new MouseEvent('mouseup'), links[0].text)
    expect(window.api.getHomeDir).toHaveBeenCalled()
    expect(window.api.pathExists).toHaveBeenCalledWith('/Users/thomas/.ssh/id_ed25519_github_personal')

    spy.mockRestore()
  })

  it('opens a scheme-less domain reference (e.g. "github.com/settings/ssh/new") as a URL, not a nonexistent file (reported bug)', async () => {
    const { links, spy } = await setupAndWriteLine('Go to github.com/settings/ssh/new to add it')

    const domainLink = links.find((l) => l.text === 'github.com/settings/ssh/new')
    expect(domainLink).toBeDefined()

    await domainLink.activate(new MouseEvent('mouseup'), domainLink.text)

    expect(window.api.pathExists).toHaveBeenCalled() // still tried as a file first
    const openedTab = useEditorStore
      .getState()
      .tabs.find((t) => t.path.startsWith('browser://'))
    expect(openedTab).toBeDefined()
    const browserId = openedTab!.path.replace('browser://', '')
    expect(useBrowserStore.getState().tabs[browserId]?.url).toBe('https://github.com/settings/ssh/new')

    spy.mockRestore()
  })

  // Claude's own "banner" links (an artifact publish confirmation, etc.) are
  // rendered by the CLI as real OSC 8 terminal hyperlinks, not plain pasted
  // URL text — a wholly separate xterm.js code path (Terminal's `linkHandler`
  // option, consumed by its built-in OscLinkProvider) from the WebLinksAddon
  // regex matching the tests above exercise. Reported bug: clicking one of
  // these opened via xterm's default window.open() fallback instead of
  // vIDE's in-app Browser tab, because createXTerm() never set linkHandler.
  it('routes OSC 8 terminal hyperlink activation (Claude\'s own banner links) through the in-app Browser tab', async () => {
    let capturedXterm: any = null
    const spy = vi.spyOn(XTerm.prototype, 'registerLinkProvider').mockImplementation(function (
      this: any,
      _provider: any
    ) {
      capturedXterm = this
      return { dispose: () => {} }
    })

    const { container } = render(<Chat />)
    await waitFor(() => {
      if (!container.querySelector('.xterm-helper-textarea')) throw new Error('terminal not mounted yet')
    })

    expect(capturedXterm).not.toBeNull()
    const linkHandler = capturedXterm.options.linkHandler
    expect(linkHandler).toBeTruthy()

    linkHandler.activate(new MouseEvent('mouseup'), 'https://claude.ai/code/artifact/abc123')

    // .at(-1): earlier tests in this file may have already opened browser://
    // tabs of their own and state isn't reset between tests, so the most
    // recently opened tab is the one this activation produced.
    const openedTab = useEditorStore
      .getState()
      .tabs.filter((t) => t.path.startsWith('browser://'))
      .at(-1)
    expect(openedTab).toBeDefined()
    const browserId = openedTab!.path.replace('browser://', '')
    expect(useBrowserStore.getState().tabs[browserId]?.url).toBe('https://claude.ai/code/artifact/abc123')

    spy.mockRestore()
  })
})
