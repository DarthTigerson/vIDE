import type { ReactNode } from 'react'
import { useDisplayStore } from '@/stores/displayStore'
import { useBottomTerminalStore } from '@/stores/bottomTerminalStore'
import { PreviewFrame } from './primitives'

// Live pictures for Settings › Display (VIDE-145).

export function TitleBarPreview() {
  const visible = useDisplayStore((s) => s.memoryUsageVisible)
  const battery = useDisplayStore((s) => s.batteryVisible)
  return (
    <PreviewFrame testId="title-bar-preview" caption="Title bar">
      {/* Mirrors App.tsx's title bar: memory pill then a divider (only when
          both show) and the battery on the right. */}
      <MiniWindow right={(
        <>
          {visible && (
            <span data-testid="memory-preview-pill" className="flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="7" width="18" height="10" rx="1.5" stroke="currentColor" strokeWidth="2" />
                <path d="M7 7V4.5M11 7V4.5M13 7V4.5M17 7V4.5M7 17V19.5M11 17V19.5M13 17V19.5M17 17V19.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="h-1 w-5 overflow-hidden rounded-full bg-border">
                <span className="block h-full w-2/5 rounded-full bg-current" />
              </span>
              12.4/32 GB
            </span>
          )}
          {visible && battery && <span aria-hidden="true" className="h-2.5 w-px bg-border" />}
          {battery && (
            <span data-testid="battery-preview-pill" className="flex items-center gap-1">
              <svg width="15" height="8" viewBox="0 0 22 12" fill="none" aria-hidden="true">
                <rect x="0.75" y="1.75" width="17.5" height="8.5" rx="2.25" stroke="currentColor" strokeWidth="1.5" />
                <rect x="19.2" y="4.25" width="1.8" height="3.5" rx="0.9" fill="currentColor" />
                <rect x="2.5" y="3.5" width="11" height="5" rx="1" fill="currentColor" />
              </svg>
              82%
            </span>
          )}
        </>
      )}>
        <div className="h-8 bg-panel" />
      </MiniWindow>
    </PreviewFrame>
  )
}

// Editor column with the terminal panel under it (two sides) while on;
// terminal tabs among the editor's tabs while off.
export function BottomTerminalPreview() {
  const on = useBottomTerminalStore((s) => s.enabled)
  const tab = (label: string, active = false) => (
    <span className={`border-r border-border px-1.5 text-[9px] ${active ? 'bg-panel text-fg' : 'text-fg-muted'}`}>{label}</span>
  )
  return (
    <PreviewFrame testId="bottom-terminal-preview" caption="Layout">
      <MiniWindow data={{ 'data-on': on ? 'true' : 'false' }}>
        <div className="flex h-[76px] bg-panel">
          <span className="w-12 shrink-0 border-r border-border bg-sidebar" />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 border-b border-border bg-tab-bar">
              {tab('App.tsx', true)}
              {!on && tab('Terminal')}
            </div>
            <span className="flex flex-1 items-start justify-center pt-1 text-[9px] text-fg-subtle">editor</span>
            {on && (
              <div className="flex h-8 shrink-0 border-t border-border">
                {[0, 1].map((side) => (
                  <div key={side} className={`flex flex-1 flex-col ${side ? 'border-l border-border' : ''}`}>
                    <div className="flex border-b border-border bg-tab-bar">{tab('Terminal', true)}</div>
                    <span className="flex-1 px-1 font-mono text-[8px] leading-3 text-fg-muted">❯</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <span className="w-11 shrink-0 border-l border-border bg-sidebar" />
        </div>
      </MiniWindow>
    </PreviewFrame>
  )
}

export function NavbarPreview() {
  const right = useDisplayStore((s) => s.navbarPosition) === 'right'
  const nav = <span className="w-2.5 shrink-0 bg-tab-bar" />
  const files = <span className="flex w-14 shrink-0 items-start justify-center border-x border-border bg-sidebar pt-1 text-[9px] text-fg-muted">Files</span>
  const chat = <span className="flex w-16 shrink-0 items-start justify-center border-x border-border bg-sidebar pt-1 text-[9px] text-fg-muted">Claude</span>
  const editor = <span className="flex flex-1 items-start justify-center bg-panel pt-1 text-[9px] text-fg-subtle">editor</span>
  return (
    <PreviewFrame testId="navbar-preview" caption="Layout">
      <MiniWindow data={{ 'data-side': right ? 'right' : 'left' }}>
        <div className="flex h-[76px]">
          {right ? <>{nav}{chat}{editor}{files}{nav}</> : <>{nav}{files}{editor}{chat}{nav}</>}
        </div>
      </MiniWindow>
    </PreviewFrame>
  )
}

// A small vIDE window inside a preview frame: title strip (window dots, repo
// name centred, optional pills on the right) over whatever body the preview
// draws. A three-column grid so the name can never run into the pills.
// `data` lands on the root, where tests read it.
function MiniWindow({ right, data, children }: {
  right?: ReactNode
  data?: Record<`data-${string}`, string>
  children: ReactNode
}) {
  return (
    <div {...data} className="mx-2.5 mb-2.5 mt-1.5 overflow-hidden rounded-sm border border-border">
      <div className="grid h-6 grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-border bg-tab-bar px-2 text-[10px] font-medium tabular-nums text-fg-muted">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => <span key={i} className="h-[7px] w-[7px] rounded-full bg-border" />)}
        </span>
        <span className="truncate text-center">vIDE</span>
        <span className="flex items-center gap-1.5">{right}</span>
      </div>
      {children}
    </div>
  )
}
