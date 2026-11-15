import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useThemeStore } from '@/stores/themeStore'
import { useCustomThemeStore, effectiveXtermTheme } from '@/stores/customThemeStore'
import { useFontSizeStore } from '@/stores/fontSizeStore'
import { useInstanceFontSizeStore } from '@/stores/instanceFontSizeStore'
import { useDisplayStore } from '@/stores/displayStore'
import { createTerminalKeyHandler } from '@/components/Terminal/terminalKeys'
import { TerminalContextMenu } from '@/components/Terminal/TerminalContextMenu'

// A stream has no natural end, so the terminal keeps a bounded scrollback.
const SCROLLBACK_LINES = 5000

interface TerminalInstance {
  xterm: XTerm
  fit: FitAddon
}

export interface StreamTerminalProps {
  // Called on mount (and again if `streamKey` changes) with a write function;
  // returns the stop function, called on unmount.
  start: (write: (chunk: string) => void) => () => void
  // Restart the stream when this changes (e.g. a different container).
  streamKey?: string
  // What the per-tab Cmd+=/-/0 font size is stored under.
  zoomKey?: string
  // Shown until the first chunk arrives.
  placeholder?: string
  className?: string
}

// Read-only xterm over a stream the caller owns. Being a real terminal is what
// gives it text selection that survives new output, Cmd+C, ANSI colours,
// per-tab zoom and the right-click / Cmd+L "Send to Claude" actions shared
// with terminal tabs.
export function StreamTerminal({ start, streamKey, zoomKey = 'stream-terminal', placeholder, className }: StreamTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<TerminalInstance | null>(null)
  const startRef = useRef(start)
  startRef.current = start
  const [hasOutput, setHasOutput] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; selection: string } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])

  const theme = useThemeStore((s) => s.theme)
  const panelStyle = useDisplayStore((s) => s.panelStyle)
  const customActiveId = useCustomThemeStore((s) => s.activeId)
  const customThemes = useCustomThemeStore((s) => s.themes)
  const fontSize = useFontSizeStore((s) => s.fontSize)
  const fontSizeOverride = useInstanceFontSizeStore((s) => s.overrides[zoomKey])
  const effectiveFontSize = fontSizeOverride ?? fontSize
  const font = useDisplayStore((s) => s.font)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    setHasOutput(false)
    const xterm = new XTerm({
      theme: effectiveXtermTheme(useThemeStore.getState().theme, useDisplayStore.getState().panelStyle === 'glass'),
      fontFamily: useDisplayStore.getState().font,
      fontSize: useInstanceFontSizeStore.getState().overrides[zoomKey] ?? useFontSizeStore.getState().fontSize,
      convertEol: true,
      disableStdin: true,
      cursorBlink: false,
      scrollback: SCROLLBACK_LINES,
      scrollSensitivity: 3,
    })
    const fit = new FitAddon()
    xterm.loadAddon(fit)
    xterm.open(container)
    fit.fit()
    xterm.write('\x1b[?25l') // read-only: no cursor
    xterm.attachCustomKeyEventHandler(createTerminalKeyHandler(zoomKey, xterm))
    instanceRef.current = { xterm, fit }

    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(container)
    const stop = startRef.current((chunk) => {
      setHasOutput(true)
      xterm.write(chunk)
    })

    return () => {
      try { stop() } catch { /* an app's stop must not break unmount */ }
      observer.disconnect()
      instanceRef.current = null
      xterm.dispose()
    }
  }, [streamKey, zoomKey])

  useEffect(() => {
    if (!instanceRef.current) return
    instanceRef.current.xterm.options.theme = effectiveXtermTheme(theme, panelStyle === 'glass')
  }, [theme, panelStyle, customActiveId, customThemes])

  useEffect(() => {
    if (!instanceRef.current) return
    const { xterm, fit } = instanceRef.current
    xterm.options.fontSize = effectiveFontSize
    fit.fit()
  }, [effectiveFontSize])

  useEffect(() => {
    if (!instanceRef.current) return
    const { xterm, fit } = instanceRef.current
    xterm.options.fontFamily = font
    fit.fit()
  }, [font])

  return (
    <>
      <div
        className={`relative ${className ?? 'h-full'}`}
        onContextMenu={(event) => {
          event.preventDefault()
          // Read now, after xterm's own right-click handling, so the menu acts
          // on what's actually highlighted.
          const selection = instanceRef.current?.xterm.getSelection() ?? ''
          setMenu({ x: event.clientX, y: event.clientY, selection })
        }}
      >
        <div ref={containerRef} className="h-full w-full overflow-hidden rounded-lg border border-border/60 bg-bg p-3" />
        {placeholder && !hasOutput && (
          <div className="pointer-events-none absolute left-6 top-5 font-mono text-xs text-fg-muted">
            {placeholder}
          </div>
        )}
      </div>
      {menu && <TerminalContextMenu x={menu.x} y={menu.y} selection={menu.selection} onClose={closeMenu} />}
    </>
  )
}
