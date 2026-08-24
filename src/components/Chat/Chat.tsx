import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { useFileStore } from '@/stores/fileStore'
import { useClaudeStore } from '@/stores/claudeStore'
import { useThemeStore, XTERM_THEMES, glassXtermTheme, type ThemeId } from '@/stores/themeStore'
import { useFontSizeStore } from '@/stores/fontSizeStore'
import { useInstanceFontSizeStore } from '@/stores/instanceFontSizeStore'
import { useDisplayStore, type PanelStyle } from '@/stores/displayStore'
import { BridgeChat } from './BridgeChat'
import { UsagePanel } from '@/components/UsagePanel/UsagePanel'
import { isShiftEnterKeydown, SHIFT_ENTER_SEQUENCE } from './shiftEnterSequence'
import { wrapBracketedPaste } from '@/lib/sendSelectionToAssistant'
import { createFilePathLinkProvider, createFilePathActivateHandler, createUrlActivateHandler, openUrlInBrowserTab } from './terminalLinks'
import type { AssistantKind } from '@/types/api'

function hasValidSize(cols: number, rows: number): boolean {
  return cols > 0 && rows > 0
}

interface AssistantTerminal {
  host: HTMLDivElement
  xterm: XTerm
  fit: FitAddon
  cleanupData: () => void
  onDataDisposable: { dispose: () => void }
}

const ASSISTANTS: AssistantKind[] = ['claude', 'codex']

function createXTerm(themeId: ThemeId, panelStyle: PanelStyle, fontSize: number): XTerm {
  return new XTerm({
    theme: panelStyle === 'glass' ? glassXtermTheme(themeId) : XTERM_THEMES[themeId],
    fontFamily: useDisplayStore.getState().font,
    fontSize,
    cursorBlink: true,
    convertEol: true,
    // Without this, xterm's built-in OscLinkProvider handles OSC 8 terminal
    // hyperlinks (real clickable links the CLI itself renders — e.g. an
    // artifact-publish banner — distinct from WebLinksAddon's plain-URL-text
    // regex matching below) by falling back to window.open(), which bypasses
    // vIDE's in-app Browser tab entirely.
    linkHandler: { activate: (_event, uri) => openUrlInBrowserTab(uri) },
  })
}

export function Chat() {
  const projectRoot = useFileStore((s) => s.projectRoot)
  const assistant = useClaudeStore((s) => s.assistant)
  const usageOpen = useClaudeStore((s) => s.usageOpen)
  const focusToken = useClaudeStore((s) => s.focusToken)
  const restartToken = useClaudeStore((s) => s.restartToken)
  const theme = useThemeStore((s) => s.theme)
  const panelStyle = useDisplayStore((s) => s.panelStyle)
  const fontSize = useFontSizeStore((s) => s.fontSize)
  const claudeFontSizeOverride = useInstanceFontSizeStore((s) => s.overrides.claude)
  const codexFontSizeOverride = useInstanceFontSizeStore((s) => s.overrides.codex)
  const font = useDisplayStore((s) => s.font)
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalsRef = useRef<Partial<Record<AssistantKind, AssistantTerminal>>>({})
  const activeAssistantRef = useRef<AssistantKind>(assistant)
  const isFirstRestart = useRef(true)
  const seenFocusTokenRef = useRef(focusToken)

  useEffect(() => {
    activeAssistantRef.current = assistant
  }, [assistant])

  useEffect(() => {
    if (!projectRoot || !containerRef.current || assistant === 'bridge') return

    const container = containerRef.current

    const ensureTerminal = (kind: AssistantKind): AssistantTerminal => {
      const existing = terminalsRef.current[kind]
      if (existing) return existing

      const host = document.createElement('div')
      host.className = 'h-full w-full overflow-hidden'
      host.style.display = kind === assistant ? 'block' : 'none'
      container.appendChild(host)

      const initialFontSize = useInstanceFontSizeStore.getState().overrides[kind] ?? useFontSizeStore.getState().fontSize
      const xterm = createXTerm(useThemeStore.getState().theme, useDisplayStore.getState().panelStyle, initialFontSize)
      const fit = new FitAddon()
      xterm.loadAddon(fit)
      xterm.open(host)

      // xterm only allows one attached custom key handler per instance, so
      // Claude's Shift+Enter handling and the per-panel zoom shortcut (both
      // needed here) have to live in a single combined handler.
      xterm.attachCustomKeyEventHandler((event) => {
        if (event.type !== 'keydown') return true

        if (kind === 'claude' && isShiftEnterKeydown(event)) {
          // xterm sends the same CR byte for Enter and Shift+Enter by default, which
          // Claude Code's CLI reads as "submit" either way. Send the ESC+CR sequence
          // it expects for "insert newline" instead of falling through to xterm's
          // default Enter handling.
          //
          // Returning false here short-circuits xterm's own _keyDown before it ever
          // calls cancel() (its preventDefault/stopPropagation), so without calling
          // preventDefault ourselves the browser still runs Enter's default action —
          // inserting a newline into xterm's hidden textarea — which xterm's input
          // handler then forwards to the PTY as a stray extra keystroke right behind
          // our escape sequence, submitting the message anyway.
          event.preventDefault()
          window.api.assistantWrite(kind, SHIFT_ENTER_SEQUENCE)
          return false
        }

        // CmdOrCtrl+=/-/0 (unshifted) zoom just this panel; shifted variants are
        // left unhandled so they pass through to the app-level global zoom shortcut.
        const isMod = event.metaKey || event.ctrlKey
        if (isMod && !event.shiftKey && !event.altKey) {
          if (event.key === '=' || event.key === '+') {
            useInstanceFontSizeStore.getState().increase(kind)
            return false
          }
          if (event.key === '-' || event.key === '_') {
            useInstanceFontSizeStore.getState().decrease(kind)
            return false
          }
          if (event.key === '0') {
            useInstanceFontSizeStore.getState().reset(kind)
            return false
          }
        }

        return true
      })

      if (kind === 'claude') {
        // Clickable file paths and URLs in Claude's own output. Registered in
        // this order so a URL match wins over the file-path one for any
        // overlapping range (a URL's own path segment, e.g. "/path.txt" in
        // "https://example.com/path.txt", would otherwise also satisfy the
        // file-path provider) — xterm de-dupes intersecting links across
        // providers, first-registered wins. URLs go through the stock
        // WebLinksAddon (real URLs parse fine as URL objects); file paths use
        // a custom provider — see createFilePathLinkProvider's own comment
        // for why WebLinksAddon can't be reused for those.
        xterm.loadAddon(new WebLinksAddon(createUrlActivateHandler()))
        xterm.registerLinkProvider(createFilePathLinkProvider(xterm, createFilePathActivateHandler()))
      }

      window.api.assistantSpawn(projectRoot, kind)
      const cleanupData = window.api.onAssistantData((source, data) => {
        if (source === kind) xterm.write(data)
      })
      const onDataDisposable = xterm.onData((data) => window.api.assistantWrite(kind, data))

      const terminal = { host, xterm, fit, cleanupData, onDataDisposable }
      terminalsRef.current[kind] = terminal
      return terminal
    }

    ASSISTANTS.forEach((kind) => {
      const terminal = kind === assistant ? ensureTerminal(kind) : terminalsRef.current[kind]
      if (!terminal) return

      terminal.host.style.display = kind === assistant ? 'block' : 'none'
    })

    const activeTerminal = ensureTerminal(assistant)
    requestAnimationFrame(() => {
      activeTerminal.fit.fit()
      if (hasValidSize(activeTerminal.xterm.cols, activeTerminal.xterm.rows)) {
        window.api.assistantResize(assistant, activeTerminal.xterm.cols, activeTerminal.xterm.rows)
      }
    })
  }, [projectRoot, assistant])

  useEffect(() => {
    if (assistant === 'bridge') return
    const terminal = terminalsRef.current[assistant]
    if (!terminal) return

    const injection = useClaudeStore.getState().pendingInjection
    if (injection) {
      window.api.assistantWrite(assistant, wrapBracketedPaste(injection))
      useClaudeStore.getState().consumeInjection()
      seenFocusTokenRef.current = focusToken
      terminal.xterm.focus()
      return
    }
    if (focusToken === seenFocusTokenRef.current) return
    seenFocusTokenRef.current = focusToken
    terminal.xterm.focus()
  }, [focusToken, assistant])

  useEffect(() => {
    Object.values(terminalsRef.current).forEach((terminal) => {
      terminal.xterm.options.theme = panelStyle === 'glass' ? glassXtermTheme(theme) : XTERM_THEMES[theme]
    })
  }, [theme, panelStyle])

  useEffect(() => {
    const overrides: Partial<Record<AssistantKind, number>> = { claude: claudeFontSizeOverride, codex: codexFontSizeOverride }
    ASSISTANTS.forEach((kind) => {
      const terminal = terminalsRef.current[kind]
      if (!terminal) return
      terminal.xterm.options.fontSize = overrides[kind] ?? fontSize
      terminal.fit.fit()
      // A font-size change resizes the cell grid (more/fewer cols and rows fit
      // the same pixel area). Without relaying that to the PTY, the CLI keeps
      // rendering for its old dimensions until some other resize (e.g. dragging
      // the pane) happens to sync it — producing a visibly broken TUI layout.
      if (hasValidSize(terminal.xterm.cols, terminal.xterm.rows)) {
        window.api.assistantResize(kind, terminal.xterm.cols, terminal.xterm.rows)
      }
    })
  }, [fontSize, claudeFontSizeOverride, codexFontSizeOverride])

  useEffect(() => {
    ASSISTANTS.forEach((kind) => {
      const terminal = terminalsRef.current[kind]
      if (!terminal) return
      terminal.xterm.options.fontFamily = font
      terminal.fit.fit()
      if (hasValidSize(terminal.xterm.cols, terminal.xterm.rows)) {
        window.api.assistantResize(kind, terminal.xterm.cols, terminal.xterm.rows)
      }
    })
  }, [font])

  useEffect(() => {
    if (!projectRoot || !containerRef.current) return

    const observer = new ResizeObserver(() => {
      const activeAssistant = activeAssistantRef.current
      if (activeAssistant === 'bridge') return
      const activeTerminal = terminalsRef.current[activeAssistant]
      if (!activeTerminal) return

      activeTerminal.fit.fit()
      if (hasValidSize(activeTerminal.xterm.cols, activeTerminal.xterm.rows)) {
        window.api.assistantResize(activeAssistant, activeTerminal.xterm.cols, activeTerminal.xterm.rows)
      }
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
    }
  }, [projectRoot])

  useEffect(() => {
    return () => {
      Object.values(terminalsRef.current).forEach((terminal) => {
        terminal.cleanupData()
        terminal.onDataDisposable.dispose()
        terminal.xterm.dispose()
        terminal.host.remove()
      })
      terminalsRef.current = {}
    }
  }, [projectRoot])

  useEffect(() => {
    if (isFirstRestart.current) {
      isFirstRestart.current = false
      return
    }
    const terminal = terminalsRef.current[activeAssistantRef.current]
    if (!terminal) return
    terminal.xterm.clear()
    // A restart ("New Session" / "Continue Session") spawns a brand-new PTY on
    // the main-process side, which node-pty always creates at its 80x24
    // default — nothing there knows this pane's actual size. The xterm
    // instance itself is untouched by a restart though, so it already holds
    // the correct, previously-fitted cols/rows; just relay those to the new
    // PTY instead of leaving it stuck at 80x24 until the panel is manually
    // resized.
    if (hasValidSize(terminal.xterm.cols, terminal.xterm.rows)) {
      window.api.assistantResize(activeAssistantRef.current, terminal.xterm.cols, terminal.xterm.rows)
    }
  }, [restartToken])

  return (
    <div className="h-full flex flex-col bg-bg border-l border-border overflow-hidden">
      {projectRoot ? (
        <>
          <div
            ref={containerRef}
            className="flex-1 overflow-hidden p-1"
            style={{ display: assistant === 'bridge' ? 'none' : 'block' }}
          />
          {assistant === 'bridge' && (
            <div className="flex-1 overflow-hidden">
              <BridgeChat cwd={projectRoot} />
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center px-6">
          <p className="text-xs text-fg-muted text-center leading-relaxed">
            Open a folder to start {assistant === 'claude' ? 'Claude Code' : assistant === 'codex' ? 'Codex' : 'Bridge'}
          </p>
        </div>
      )}
      {assistant === 'claude' && usageOpen && <UsagePanel />}
    </div>
  )
}
