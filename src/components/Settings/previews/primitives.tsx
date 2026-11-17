import type { ReactNode } from 'react'
import { useThemeStore } from '@/stores/themeStore'
import { THEME_PALETTES, DEFAULT_TOKENS } from '@/monacoThemes'

// Building blocks for settings previews (VIDE-145): small drawings of bits of
// vIDE, made from theme tokens so they match the active theme, and cheap -
// no Monaco, no real components. Decorative, so hidden from screen readers.

export function PreviewFrame({ caption, testId, children }: { caption?: string; testId?: string; children: ReactNode }) {
  return (
    <figure
      data-testid={testId}
      aria-hidden="true"
      className="m-0 select-none overflow-hidden rounded-lg border border-border bg-bg text-[11px] text-fg"
    >
      {caption && <figcaption className="px-2.5 pt-1.5 text-[10px] uppercase tracking-wider text-fg-subtle">{caption}</figcaption>}
      {children}
    </figure>
  )
}

export type CodeSegment = { text: string; token?: 'keyword' | 'number' | 'string'; className?: string }
export type CodeLine = {
  n: number
  segments: CodeSegment[]
  current?: boolean
  lineClassName?: string
  numberClassName?: string
  trailing?: ReactNode
}

export function MiniCode({ lines }: { lines: CodeLine[] }) {
  const palette = THEME_PALETTES[useThemeStore((s) => s.theme)]
  const tokens = DEFAULT_TOKENS[palette.base]
  return (
    <div className="py-1.5 font-mono text-[11px] leading-[1.75]">
      {lines.map((line) => (
        <div key={line.n} className={['flex whitespace-pre', line.current ? 'bg-white/5' : '', line.lineClassName ?? ''].join(' ')}>
          <span className={['w-7 shrink-0 pr-2.5 text-right text-fg-subtle', line.numberClassName ?? ''].join(' ')}>{line.n}</span>
          <span className="shrink-0 pr-2">
            {line.segments.map((s, i) => (
              <span key={i} className={s.className} style={s.token ? { color: tokens[s.token] } : undefined}>{s.text}</span>
            ))}
          </span>
          {line.trailing && <span className="min-w-0 truncate pr-2">{line.trailing}</span>}
        </div>
      ))}
    </div>
  )
}

export function MiniFooter({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <div data-mini-footer="" className="flex items-center justify-between gap-2 border-t border-border bg-sidebar px-2.5 py-1 text-[10.5px] text-fg-muted">
      <span className="truncate">{left}</span>
      <span className="flex min-w-0 items-center gap-1.5 truncate">{right}</span>
    </div>
  )
}

export function MiniTabs({ tabs }: { tabs: { label: string; active?: boolean; dot?: boolean }[] }) {
  return (
    <div className="flex gap-0.5 border-b border-border px-2 pt-1.5">
      {tabs.map((t) => (
        <span
          key={t.label}
          data-active={t.active ? 'true' : undefined}
          className={[
            'rounded-t-sm border border-b-0 px-2 py-0.5 text-[10.5px]',
            t.active ? 'border-border bg-panel text-fg' : 'border-transparent text-fg-muted',
          ].join(' ')}
        >
          {t.label}
          {t.dot && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-400 align-middle" />}
        </span>
      ))}
    </div>
  )
}

export type MiniPane = { id?: string; grow: number; tabs: { label: string; isNew?: boolean }[]; focused?: boolean }

export function MiniPanes({ panes }: { panes: MiniPane[] }) {
  return (
    <div className="flex h-[88px] gap-1.5 p-2">
      {panes.map((pane, i) => {
        const hasNew = pane.tabs.some((t) => t.isNew)
        return (
          <div
            key={i}
            data-pane={pane.id}
            style={{ flexGrow: pane.grow }}
            className={['flex min-w-0 basis-0 flex-col overflow-hidden rounded-sm border', hasNew ? 'border-accent' : 'border-border'].join(' ')}
          >
            <div className="flex gap-0.5 overflow-hidden border-b border-border bg-sidebar px-1 pt-1">
              {pane.tabs.map((t) => (
                <span
                  key={t.label}
                  data-new={t.isNew ? 'true' : undefined}
                  className={['truncate rounded-t-sm px-1.5 text-[10px]', t.isNew ? 'bg-accent/20 text-fg' : 'text-fg-muted'].join(' ')}
                >
                  {t.label}
                </span>
              ))}
            </div>
            <div className="flex flex-1 items-end p-1">
              {pane.focused && <span className="text-[9px] uppercase tracking-wider text-fg-subtle">focused</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
