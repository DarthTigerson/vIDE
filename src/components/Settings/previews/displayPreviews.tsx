import { useDisplayStore } from '@/stores/displayStore'
import { useBottomTerminalStore } from '@/stores/bottomTerminalStore'
import { PreviewFrame } from './primitives'

// Live pictures for Settings › Display (VIDE-145).

export function MemoryPreview() {
  const visible = useDisplayStore((s) => s.memoryUsageVisible)
  return (
    <PreviewFrame testId="memory-preview" caption="Title bar">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 rounded-full bg-fg-subtle/60" />)}
        </span>
        <span className="flex-1" />
        {visible && (
          <span data-testid="memory-preview-pill" className="rounded-full border border-border px-2 text-[10px] text-fg-muted">
            12.4 / 32 GB
          </span>
        )}
        <span className="rounded border border-border px-2 text-[10px] text-fg">Claude ▾</span>
      </div>
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
    <PreviewFrame testId="bottom-terminal-preview">
      <div data-on={on ? 'true' : 'false'} className="flex h-[84px]">
        <span className="w-14 shrink-0 border-r border-border bg-sidebar/60" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 border-b border-border bg-tab-bar">
            {tab('App.tsx', true)}
            {!on && tab('Terminal')}
          </div>
          <span className="flex flex-1 items-start justify-center pt-1 text-[9px] text-fg-subtle">editor</span>
          {on && (
            <div className="flex h-9 shrink-0 border-t border-border">
              {[0, 1].map((side) => (
                <div key={side} className={`flex flex-1 flex-col ${side ? 'border-l border-border' : ''}`}>
                  <div className="flex border-b border-border bg-tab-bar">{tab('Terminal', true)}</div>
                  <span className="flex-1 px-1 font-mono text-[8px] leading-3 text-fg-muted">❯</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <span className="w-12 shrink-0 border-l border-border bg-sidebar/60" />
      </div>
    </PreviewFrame>
  )
}

export function NavbarPreview() {
  const right = useDisplayStore((s) => s.navbarPosition) === 'right'
  const nav = <span className="w-2.5 shrink-0 bg-sidebar" />
  const files = <span className="flex w-14 shrink-0 items-start justify-center border-x border-border bg-sidebar/60 pt-1 text-[9px] text-fg-muted">Files</span>
  const chat = <span className="flex w-16 shrink-0 items-start justify-center border-x border-border bg-sidebar/60 pt-1 text-[9px] text-fg-muted">Claude</span>
  const editor = <span className="flex flex-1 items-start justify-center pt-1 text-[9px] text-fg-subtle">editor</span>
  return (
    <PreviewFrame testId="navbar-preview">
      <div data-side={right ? 'right' : 'left'} className="flex h-[84px]">
        {right ? <>{nav}{chat}{editor}{files}{nav}</> : <>{nav}{files}{editor}{chat}{nav}</>}
      </div>
    </PreviewFrame>
  )
}
