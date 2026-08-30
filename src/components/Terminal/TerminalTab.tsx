import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useThemeStore, XTERM_THEMES, glassXtermTheme } from '@/stores/themeStore'
import { useFontSizeStore } from '@/stores/fontSizeStore'
import { useInstanceFontSizeStore } from '@/stores/instanceFontSizeStore'
import { useDisplayStore } from '@/stores/displayStore'
import { useFileStore } from '@/stores/fileStore'
import { useEditorStore } from '@/stores/editorStore'
import { buildTerminalPath } from '@/components/Settings/paths'

interface Props {
  terminalId: string
}

interface TerminalInstance {
  xterm: XTerm
  fit: FitAddon
}

// Module-level map keeps XTerm instances alive across React remounts
// (split pane reflows, StrictMode double-invoke, tab switching)
const liveTerminals = new Map<string, TerminalInstance>()

// A command queued to run as soon as a fresh terminal with this id finishes
// spawning — e.g. the file tree's "Run" action on a .sh file, which opens a
// brand-new terminal and needs the script to execute in it. Set this before
// opening the tab; TerminalTab writes and clears it once its own spawn
// promise resolves, so the write can never race ahead of the PTY existing.
export const pendingTerminalCommands = new Map<string, string>()

function hasValidSize(cols: number, rows: number): boolean {
  return cols > 0 && rows > 0
}

export function TerminalTab({ terminalId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<TerminalInstance | null>(null)
  const theme = useThemeStore((s) => s.theme)
  const panelStyle = useDisplayStore((s) => s.panelStyle)
  const fontSize = useFontSizeStore((s) => s.fontSize)
  const fontSizeOverride = useInstanceFontSizeStore((s) => s.overrides[terminalId])
  const effectiveFontSize = fontSizeOverride ?? fontSize
  const font = useDisplayStore((s) => s.font)

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current

    let instance = liveTerminals.get(terminalId)

    if (instance?.xterm.element) {
      // Reattach existing terminal to the new container — preserves all scrollback
      container.innerHTML = ''
      container.appendChild(instance.xterm.element)
      instance.fit.fit()
      instance.xterm.focus()
    } else {
      // First time: create a fresh terminal and PTY
      const initialTheme = useThemeStore.getState().theme
      const xterm = new XTerm({
        theme: useDisplayStore.getState().panelStyle === 'glass'
          ? glassXtermTheme(initialTheme)
          : XTERM_THEMES[initialTheme],
        fontFamily: useDisplayStore.getState().font,
        fontSize: useInstanceFontSizeStore.getState().overrides[terminalId] ?? useFontSizeStore.getState().fontSize,
        cursorBlink: true,
        convertEol: true,
        // xterm.js's default (1) maps physical mouse-wheel notches almost
        // 1:1 to pixels before converting to rows, so a notched USB/Bluetooth
        // mouse (which reports far coarser, less frequent deltaY than a
        // trackpad's continuous small deltas) needs many notches to move a
        // single line. Trackpad scrolling stays smooth at this value since
        // its deltas are already fine-grained.
        scrollSensitivity: 3,
      })
      const fit = new FitAddon()
      xterm.loadAddon(fit)
      container.innerHTML = ''
      xterm.open(container)
      fit.fit()
      xterm.focus()

      instance = { xterm, fit }
      liveTerminals.set(terminalId, instance)

      const cwd = useFileStore.getState().projectRoot ?? undefined
      const spawnPromise = window.api.termSpawn(terminalId, cwd)
      // Register once — survives remounts because the instance stays in liveTerminals
      xterm.onData((data) => window.api.termWrite(terminalId, data))

      const pendingCommand = pendingTerminalCommands.get(terminalId)
      if (pendingCommand) {
        pendingTerminalCommands.delete(terminalId)
        spawnPromise.then(() => window.api.termWrite(terminalId, pendingCommand))
      }
      // CmdOrCtrl+=/-/0 (unshifted) resize just this terminal; shifted variants are
      // left unhandled so they pass through to the app-level global zoom shortcut.
      xterm.attachCustomKeyEventHandler((event) => {
        if (event.type !== 'keydown') return true
        const isMod = event.metaKey || event.ctrlKey
        if (!isMod || event.shiftKey || event.altKey) return true

        if (event.key === '=' || event.key === '+') {
          useInstanceFontSizeStore.getState().increase(terminalId)
          return false
        }
        if (event.key === '-' || event.key === '_') {
          useInstanceFontSizeStore.getState().decrease(terminalId)
          return false
        }
        if (event.key === '0') {
          useInstanceFontSizeStore.getState().reset(terminalId)
          return false
        }
        return true
      })
    }

    instanceRef.current = instance
    const { xterm, fit } = instance

    const cleanupData = window.api.onTermData((id, data) => {
      if (id === terminalId) xterm.write(data)
    })
    const cleanupExit = window.api.onTermExit((id) => {
      if (id === terminalId) xterm.write('\r\n\x1b[90m[process exited]\x1b[0m\r\n')
    })

    const observer = new ResizeObserver(() => {
      fit.fit()
      if (hasValidSize(xterm.cols, xterm.rows)) {
        window.api.termResize(terminalId, xterm.cols, xterm.rows)
      }
    })
    observer.observe(container)

    return () => {
      cleanupData()
      cleanupExit()
      observer.disconnect()

      const tabPath = buildTerminalPath(terminalId)
      const stillOpen = useEditorStore.getState().tabs.some((t) => t.path === tabPath)
      if (!stillOpen) {
        // Tab was closed — clean up everything
        xterm.dispose()
        liveTerminals.delete(terminalId)
        window.api.termKill(terminalId)
      }
      // Otherwise: leave xterm.element detached from DOM but alive in liveTerminals
      // so the next mount can reattach it with full scrollback intact
    }
  }, [terminalId])

  useEffect(() => {
    if (!instanceRef.current) return
    instanceRef.current.xterm.options.theme =
      panelStyle === 'glass' ? glassXtermTheme(theme) : XTERM_THEMES[theme]
  }, [theme, panelStyle])

  useEffect(() => {
    if (!instanceRef.current) return
    const { xterm, fit } = instanceRef.current
    xterm.options.fontSize = effectiveFontSize
    fit.fit()
    // A font-size change resizes the cell grid (more/fewer cols and rows fit
    // the same pixel area). Without relaying that to the PTY, the shell keeps
    // rendering for its old dimensions until some other resize happens to
    // sync it — producing a visibly broken TUI layout for full-screen apps.
    if (hasValidSize(xterm.cols, xterm.rows)) {
      window.api.termResize(terminalId, xterm.cols, xterm.rows)
    }
  }, [effectiveFontSize, terminalId])

  useEffect(() => {
    if (!instanceRef.current) return
    const { xterm, fit } = instanceRef.current
    xterm.options.fontFamily = font
    fit.fit()
    if (hasValidSize(xterm.cols, xterm.rows)) {
      window.api.termResize(terminalId, xterm.cols, xterm.rows)
    }
  }, [font, terminalId])

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden bg-bg p-1" />
  )
}
