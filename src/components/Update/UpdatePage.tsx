import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useUpdateStore } from '@/stores/updateStore'
import { useEditorStore } from '@/stores/editorStore'
import { UPDATE_TAB_PATH } from '@/components/Settings/paths'
import { COMPACT_PROSE_CLASSES } from '@/components/Viewer/proseClasses'
import { changelogHighlights, type UpdateFailure } from '@/lib/updateStage'

// Mockup "U1 — Track": Download → Install → Ready stops on a line.
const STOPS = ['Download', 'Install', 'Ready'] as const
type StopState = 'todo' | 'now' | 'done' | 'fail'

const FAILURE_TEXT: Record<UpdateFailure, string> = {
  'admin-declined': 'Administrator rights were declined, so nothing was changed.',
  unsupported: "This machine isn't supported by the vIDE build yet.",
  error: 'The install stopped with an error.',
}

// The Update tab (VIDE-142): runs the update in place of the old terminal
// tab, shows its stage on a track, and offers Restart on the same page.
export function UpdatePage() {
  const available = useUpdateStore((s) => s.available)
  const status = useUpdateStore((s) => s.status)
  const stage = useUpdateStore((s) => s.stage)
  const failure = useUpdateStore((s) => s.failure)
  const log = useUpdateStore((s) => s.log)
  const changelog = useUpdateStore((s) => s.changelog)
  const startUpdate = useUpdateStore((s) => s.startUpdate)
  const restart = useUpdateStore((s) => s.restart)
  const [showDetails, setShowDetails] = useState(false)
  const [showFullNotes, setShowFullNotes] = useState(false)

  // Injected by electron.vite.config.ts; absent under vitest.
  const current = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : null
  const next = available?.version

  const stops: StopState[] = (() => {
    if (status === 'ready') return ['done', 'done', 'done']
    if (status === 'failed') return stage === 'download' ? ['fail', 'todo', 'todo'] : ['done', 'fail', 'todo']
    if (status === 'updating') return stage === 'download' ? ['now', 'todo', 'todo'] : ['done', 'now', 'todo']
    return ['todo', 'todo', 'todo']
  })()
  const fill = status === 'ready' ? 1 : status === 'idle' ? 0 : stage === 'download' ? 0.18 : 0.6
  // Comets run along whichever stretch of the track is in progress.
  const lane = status === 'updating' ? (stage === 'download' ? 0 : 1) : null

  const [title, subtitle] = (() => {
    if (!next) return ['vIDE is up to date', current ? `You're on v${current}.` : '']
    switch (status) {
      case 'idle':
        return [`vIDE v${next} is available`, current ? `You have v${current}.` : '']
      case 'updating':
        return [
          `Updating to v${next}`,
          stage === 'password' ? 'Waiting for your password' : stage === 'install' ? 'Installing…' : 'Downloading…',
        ]
      case 'ready':
        return [`v${next} is installed`, 'Restart vIDE to start using it.']
      case 'failed':
        return [
          "The update didn't finish",
          `${FAILURE_TEXT[failure ?? 'error']}${current ? ` v${current} is still installed.` : ''}`,
        ]
    }
  })()

  const news = next && changelog
  const summary = news ? changelogHighlights(changelog) : null
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  return (
    // flex + m-auto centres the content both ways, and unlike
    // items-center still lets the tab scroll when the full notes are open.
    <div className="flex h-full overflow-auto bg-panel">
      <div className={['m-auto grid w-full max-w-[66rem] gap-14 px-10 py-12', news ? 'grid-cols-[minmax(0,1fr)_24rem]' : ''].join(' ')}>
        <div className="flex flex-col items-center gap-7 pt-2 text-center">
          <div data-testid="update-track" className="relative h-[11rem] w-full max-w-[30rem]">
            <div className="absolute inset-x-7 top-[5.5rem] h-1 rounded-sm bg-border">
              <div className="update-track-fill absolute inset-y-0 left-0 rounded-sm bg-accent" style={{ width: `${fill * 100}%` }} />
            </div>
            {lane !== null && (
              <div className="update-track-lane absolute top-[5.375rem] h-2 overflow-hidden" style={{ left: `calc(1.75rem + (100% - 3.5rem) * ${lane * 0.5})`, width: 'calc((100% - 3.5rem) * 0.5)' }}>
                <span /><span /><span />
              </div>
            )}
            {STOPS.map((label, i) => {
              const state = stops[i]
              const left = `calc(1.75rem + (100% - 3.5rem) * ${i * 0.5})`
              return (
                <div key={label}>
                  <div
                    data-testid={`update-stop-${label.toLowerCase()}`}
                    data-state={state}
                    className={[
                      'absolute top-[5.625rem] -ml-[1.375rem] -mt-[1.375rem] flex h-11 w-11 items-center justify-center rounded-full border-2 transition-colors [&_svg]:h-5 [&_svg]:w-5',
                      state === 'done' ? 'border-accent bg-accent text-on-accent'
                        : state === 'now' ? 'update-track-now border-accent bg-panel text-accent'
                          : state === 'fail' ? 'border-red-400 bg-red-400 text-panel'
                            : 'border-border bg-panel text-fg-subtle',
                    ].join(' ')}
                    style={{ left }}
                  >
                    {state === 'done' ? <CheckIcon /> : state === 'fail' ? <CrossIcon /> : i === 0 ? <DownloadIcon /> : i === 1 ? <BoxIcon /> : <CheckIcon />}
                  </div>
                  <div className="absolute top-[8.25rem] -translate-x-1/2 whitespace-nowrap text-sm text-fg-subtle" style={{ left }}>{label}</div>
                </div>
              )
            })}
          </div>

          <div>
            <h1 className="text-3xl font-semibold text-fg">{title}</h1>
            {subtitle && <p data-testid="update-subtitle" className="mt-2 text-base text-fg-muted">{subtitle}</p>}
          </div>

          {status === 'updating' && stage === 'password' && (
            <div className="flex max-w-[34rem] items-center gap-3 rounded-lg border border-accent/50 bg-accent/10 px-4 py-3 text-left text-sm text-fg [&_svg]:h-6 [&_svg]:w-6 [&_svg]:shrink-0 [&_svg]:text-accent">
              <LockIcon />
              <span>
                macOS is asking for your password (or Touch ID) to replace vIDE in /Applications.{' '}
                <span className="text-fg-muted">Look for the system dialog.</span>
              </span>
            </div>
          )}

          <div className="flex min-h-10 justify-center gap-3">
            {next && status === 'idle' && <PillButton solid onClick={startUpdate}>Update now</PillButton>}
            {status === 'ready' && (
              <>
                <PillButton solid onClick={restart}>Restart now</PillButton>
                <PillButton onClick={() => useEditorStore.getState().closeTab(UPDATE_TAB_PATH)}>Later</PillButton>
              </>
            )}
            {status === 'failed' && <PillButton solid onClick={startUpdate}>Try again</PillButton>}
          </div>
          {status === 'ready' && (
            <p className="max-w-[48ch] text-sm text-fg-subtle">Later keeps "Update installed — click to restart" in the bell until you do.</p>
          )}

          {log.length > 0 && (
            <div className="w-full max-w-[36rem] text-left">
              <button type="button" onClick={() => setShowDetails((v) => !v)} className="text-sm text-fg-muted hover:text-fg">
                {showDetails ? '▾ Hide details' : '▸ Show details'}
              </button>
              {showDetails && (
                <pre data-testid="update-log" className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-bg px-4 py-3 font-mono text-xs leading-relaxed text-fg-muted">
                  {log.map((l, i) => (
                    <div key={i} className={l.stream === 'stderr' ? 'text-red-400' : undefined}>{l.line}</div>
                  ))}
                </pre>
              )}
            </div>
          )}
        </div>

        {news && summary && (
          <aside data-testid="update-whats-new" className="self-center border-l border-border pl-8 text-left">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-fg-muted">What's new in v{next}</h2>
            {showFullNotes ? (
              <div className={[COMPACT_PROSE_CLASSES, 'px-0! py-0!'].join(' ')}>
                <ReactMarkdown>{changelog}</ReactMarkdown>
              </div>
            ) : (
              <ul data-testid="update-highlights" className="flex flex-col gap-3 text-base text-fg">
                {summary.highlights.map((h) => (
                  <li key={h} className="flex items-baseline gap-2">
                    <span className="mt-[0.5rem] h-2 w-2 shrink-0 rounded-full bg-accent" />
                    <span>{h}</span>
                  </li>
                ))}
                {(summary.otherChanges > 0 || summary.bugFixes > 0) && (
                  <li className="pl-4 text-sm text-fg-muted">
                    Plus{' '}
                    {[
                      summary.otherChanges > 0 && count(summary.otherChanges, 'smaller change', 'smaller changes'),
                      summary.bugFixes > 0 && count(summary.bugFixes, 'bug fix', 'bug fixes'),
                    ].filter(Boolean).join(' and ')}
                  </li>
                )}
              </ul>
            )}
            <button type="button" onClick={() => setShowFullNotes((v) => !v)} className="mt-5 text-sm text-fg-muted hover:text-fg">
              {showFullNotes ? '▾ Show highlights' : '▸ Full release notes'}
            </button>
          </aside>
        )}
      </div>
    </div>
  )
}

function PillButton({ solid, onClick, children }: { solid?: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'h-10 rounded-full px-6 text-base transition-colors',
        solid ? 'border border-accent bg-accent font-semibold text-on-accent' : 'border border-border bg-bg text-fg hover:border-fg-subtle',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

const svg = (d: string, width = 2) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d={d} stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const DownloadIcon = () => svg('M12 4v11m0 0-4-4m4 4 4-4M5 20h14')
const BoxIcon = () => svg('M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8')
const CheckIcon = () => svg('M5 12.5l4.5 4.5L19 7.5', 2.4)
const CrossIcon = () => svg('M7 7l10 10M17 7 7 17', 2.4)
const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" stroke="currentColor" strokeWidth="2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="2" />
  </svg>
)
