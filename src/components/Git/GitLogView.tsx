import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useRepoGitLogText } from '@/stores/gitLogStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { useThemeStore } from '@/stores/themeStore'
import { useCustomThemeStore, effectiveXtermTheme } from '@/stores/customThemeStore'
import { useDisplayStore } from '@/stores/displayStore'
import { useFontSizeStore } from '@/stores/fontSizeStore'
import { useInstanceFontSizeStore } from '@/stores/instanceFontSizeStore'
import { GIT_LOG_TAB_PATH } from '@/components/Settings/paths'

function hasValidSize(cols: number, rows: number): boolean {
  return cols > 0 && rows > 0
}

// Read-only: git commands run headless (see gitStore.ts), this just mirrors
// their output. Unlike TerminalTab there's no PTY to write keystrokes into,
// so disableStdin keeps the cursor from looking interactive.
export function GitLogView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const writtenLenRef = useRef(0)

  const selectedRepo = useGitReposStore((s) => s.selectedRepo)
  const text = useRepoGitLogText(selectedRepo)
  const theme = useThemeStore((s) => s.theme)
  const panelStyle = useDisplayStore((s) => s.panelStyle)
  const customActiveId = useCustomThemeStore((s) => s.activeId)
  const customThemes = useCustomThemeStore((s) => s.themes)
  const font = useDisplayStore((s) => s.font)
  const fontSize = useFontSizeStore((s) => s.fontSize)
  const fontSizeOverride = useInstanceFontSizeStore((s) => s.overrides[GIT_LOG_TAB_PATH])
  const effectiveFontSize = fontSizeOverride ?? fontSize

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current

    const xterm = new XTerm({
      theme: effectiveXtermTheme(theme, panelStyle === 'glass'),
      fontFamily: font,
      fontSize: effectiveFontSize,
      disableStdin: true,
      cursorStyle: 'bar',
      cursorBlink: false,
      convertEol: true,
    })
    const fit = new FitAddon()
    xterm.loadAddon(fit)
    xterm.open(container)
    fit.fit()

    xtermRef.current = xterm
    fitRef.current = fit
    writtenLenRef.current = 0

    const observer = new ResizeObserver(() => {
      fit.fit()
      if (hasValidSize(xterm.cols, xterm.rows)) window.api.gitLogResize(xterm.cols, xterm.rows)
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      xterm.dispose()
      xtermRef.current = null
      fitRef.current = null
    }
    // Theme/font/fontSize are kept in sync by the effects below without
    // recreating the terminal — only mount/unmount should tear this down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // selectedRepo changed: replay that repo's buffer from scratch instead of
  // diffing against whatever was written for the previous repo.
  useEffect(() => {
    const xterm = xtermRef.current
    if (!xterm) return
    xterm.reset()
    writtenLenRef.current = 0
    if (text) {
      xterm.write(text)
      writtenLenRef.current = text.length
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRepo])

  // New output for the currently-displayed repo: write only the delta.
  useEffect(() => {
    const xterm = xtermRef.current
    if (!xterm) return
    if (text.length >= writtenLenRef.current) {
      xterm.write(text.slice(writtenLenRef.current))
    } else {
      xterm.reset()
      xterm.write(text)
    }
    writtenLenRef.current = text.length
  }, [text])

  useEffect(() => {
    if (!xtermRef.current) return
    xtermRef.current.options.theme = effectiveXtermTheme(theme, panelStyle === 'glass')
  }, [theme, panelStyle, customActiveId, customThemes])

  useEffect(() => {
    if (!xtermRef.current || !fitRef.current) return
    xtermRef.current.options.fontSize = effectiveFontSize
    fitRef.current.fit()
    if (hasValidSize(xtermRef.current.cols, xtermRef.current.rows)) {
      window.api.gitLogResize(xtermRef.current.cols, xtermRef.current.rows)
    }
  }, [effectiveFontSize])

  useEffect(() => {
    if (!xtermRef.current || !fitRef.current) return
    xtermRef.current.options.fontFamily = font
    fitRef.current.fit()
    if (hasValidSize(xtermRef.current.cols, xtermRef.current.rows)) {
      window.api.gitLogResize(xtermRef.current.cols, xtermRef.current.rows)
    }
  }, [font])

  // Unshifted CmdOrCtrl+=/-/0 zoom just this panel, mirroring TerminalTab.tsx
  // — shifted variants are left unhandled so they pass through to the
  // app-level global zoom shortcut.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const isMod = event.metaKey || event.ctrlKey
    if (!isMod || event.shiftKey || event.altKey) return

    if (event.key === '=' || event.key === '+') {
      event.preventDefault()
      useInstanceFontSizeStore.getState().increase(GIT_LOG_TAB_PATH)
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      useInstanceFontSizeStore.getState().decrease(GIT_LOG_TAB_PATH)
    } else if (event.key === '0') {
      event.preventDefault()
      useInstanceFontSizeStore.getState().reset(GIT_LOG_TAB_PATH)
    }
  }

  return (
    <div
      className="h-full w-full overflow-hidden bg-bg p-1 focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}
