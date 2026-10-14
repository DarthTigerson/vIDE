import { useGeneralSettingsStore } from '@/stores/generalSettingsStore'
import { useConfigRepoStore } from '@/stores/configRepoStore'
import { PreviewFrame, MiniPanes } from './primitives'

// Live pictures for Settings › General (VIDE-145).

// A small focused window beside a big one; the new tab lands per
// "Open new tabs in".
export function NewTabPreview() {
  const biggest = useGeneralSettingsStore((s) => s.newTabPane) === 'biggest'
  const newTab = { label: 'notes.md', isNew: true }
  return (
    <PreviewFrame testId="new-tab-preview">
      <MiniPanes panes={[
        { id: 'focused', grow: 1, focused: true, tabs: [{ label: 'App.tsx' }, ...(biggest ? [] : [newTab])] },
        { id: 'big', grow: 2, tabs: [{ label: 'Editor.tsx' }, ...(biggest ? [newTab] : [])] },
      ]} />
    </PreviewFrame>
  )
}

const PREVIEW_SESSIONS = [
  { name: 'Fix redis', hue: '#D97757', active: true },
  { name: 'Write tests', hue: '#6A9BCC' },
]

function SessionGlyph({ hue }: { hue: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: hue }} />
}

// One state of the agent panel: a few terminal lines with the session bar on
// its right edge, either icons only or widened with names (floating over the
// terminal when `overlay`).
function MiniAgentPanel({ label, wide, overlay, grip, pointer }: { label: string; wide: boolean; overlay?: boolean; grip?: boolean; pointer?: boolean }) {
  const bar = (
    <div
      className={[
        'relative flex h-full flex-col border-l border-border bg-sidebar py-1',
        wide ? 'w-[76px]' : 'w-5 items-center',
        overlay ? 'shadow-lg shadow-black/40' : '',
      ].join(' ')}
    >
      {PREVIEW_SESSIONS.map((s) => (
        <span key={s.name} className={['flex h-5 items-center gap-1.5', wide ? 'px-1.5' : 'justify-center', wide && s.active ? 'bg-white/5' : ''].join(' ')}>
          <SessionGlyph hue={s.hue} />
          {wide && <span className={['truncate text-[10px]', s.active ? 'text-fg' : 'text-fg-muted'].join(' ')}>{s.name}</span>}
        </span>
      ))}
      {grip && <span className="absolute -left-[3px] bottom-3 h-3.5 w-[5px] rounded-full border border-accent bg-accent" />}
    </div>
  )
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="px-2 pb-1 text-[10px] text-fg-subtle">{label}</span>
      <div className="relative flex h-[76px] border-t border-border">
        <div className="min-w-0 flex-1 space-y-1 p-1.5 font-mono text-[9.5px] text-fg-muted">
          <div className="truncate">&gt; fix the redis timeout</div>
          <div className="h-1.5 w-4/5 rounded bg-white/10" />
          <div className="h-1.5 w-3/5 rounded bg-white/10" />
        </div>
        {overlay ? (
          <>
            <div className="w-5 shrink-0" />
            <div className="absolute inset-y-0 right-0">{bar}</div>
          </>
        ) : bar}
        {pointer && <span className="absolute bottom-1.5 right-10 text-[11px] text-fg">↖</span>}
      </div>
    </div>
  )
}

// The Claude session bar in both of its states for the chosen mode.
export function AgentBarPreview() {
  const hover = useGeneralSettingsStore((s) => s.agentBarMode) === 'hover'
  return (
    <PreviewFrame testId="agent-bar-preview">
      <div data-mode={hover ? 'hover' : 'collapse'} className="flex divide-x divide-border pt-1.5">
        {hover ? (
          <>
            <MiniAgentPanel label="At rest" wide={false} />
            <MiniAgentPanel label="Hovered" wide overlay pointer />
          </>
        ) : (
          <>
            <MiniAgentPanel label="Expanded" wide grip />
            <MiniAgentPanel label="Collapsed" wide={false} grip />
          </>
        )}
      </div>
    </PreviewFrame>
  )
}

// "owner/repo" from a clone URL (https or ssh), or null while it's not set.
export function repoNameFromUrl(url: string): string | null {
  const trimmed = url.trim().replace(/\.git$/, '').replace(/\/+$/, '')
  const parts = trimmed.split(/[/:]/).filter(Boolean)
  return parts.length >= 2 ? parts.slice(-2).join('/') : null
}

export function SyncPreview({ items }: { items: { key: string; label: string }[] }) {
  const enabled = useConfigRepoStore((s) => s.enabled)
  const repoUrl = useConfigRepoStore((s) => s.repoUrl)
  const categories = useConfigRepoStore((s) => s.categories)
  const repo = repoNameFromUrl(repoUrl)
  return (
    <PreviewFrame testId="sync-preview" caption="Your private repo">
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
        <span className={['truncate font-mono text-[10.5px]', repo ? 'text-fg' : 'text-fg-subtle'].join(' ')}>
          {repo ?? 'no repository yet'}
        </span>
        <span className="shrink-0 text-[10px] text-fg-subtle">{enabled ? 'syncing' : 'off'}</span>
      </div>
      <div className="flex flex-wrap gap-1 px-2.5 pb-2.5">
        {items.map(({ key, label }) => (
          <span
            key={key}
            data-on={categories[key] ? 'true' : undefined}
            className={[
              'rounded-full border px-1.5 text-[10px]',
              categories[key] ? 'border-accent/50 bg-accent/20 text-fg' : 'border-border text-fg-subtle',
            ].join(' ')}
          >
            {label}
          </span>
        ))}
      </div>
    </PreviewFrame>
  )
}
