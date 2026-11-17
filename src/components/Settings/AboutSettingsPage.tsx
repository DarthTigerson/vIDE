import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useUpdateStore } from '@/stores/updateStore'
import { COMPACT_PROSE_CLASSES } from '@/components/Viewer/proseClasses'
import { parseReleaseNotes, isNewerVersion } from '@/lib/releaseNotes'
import { useChangelogStore } from '@/stores/changelogStore'
// The app icon itself (also what packaging uses), not a copy in src/assets.
import appIconUrl from '../../../icon.png'
import { FeatureBlock } from './FeatureBlock'
import type { ChangelogRelease } from '../../../electron/changelog'

// "just now" / "5 min ago" / "2 hours ago" / "3 days ago"
export function formatCheckedAgo(at: number, now: number): string {
  const mins = Math.floor((now - at) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function formatReleaseDate(date: string | null): string {
  if (!date) return ''
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Settings > About (VIDE-143): the running version, Check for updates, and
// every release so far — read from the CHANGELOG bundled with the app, so
// it works offline. The running version shows in the primary colour.
export function AboutSettingsPage() {
  const available = useUpdateStore((s) => s.available)
  const checking = useUpdateStore((s) => s.checking)
  const lastCheckedAt = useUpdateStore((s) => s.lastCheckedAt)
  const checkFailed = useUpdateStore((s) => s.checkFailed)
  const status = useUpdateStore((s) => s.status)
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates)
  const loadCheckStatus = useUpdateStore((s) => s.loadCheckStatus)
  const startUpdate = useUpdateStore((s) => s.startUpdate)
  const openUpdatePage = useUpdateStore((s) => s.openUpdatePage)
  const justUpdated = useChangelogStore((s) => s.justUpdated)

  // Injected by electron.vite.config.ts; absent under vitest.
  const current = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : null

  const [releases, setReleases] = useState<ChangelogRelease[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => {
    loadCheckStatus()
    window.api.getChangelogReleases().then(
      (list) => {
        setReleases(list)
        setSelected((prev) => prev ?? (list.find((r) => r.version === current)?.version ?? list[0]?.version ?? null))
      },
      () => setReleases([]),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep "checked 5 min ago" honest while the page stays open.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(interval)
  }, [])

  const statusLine = checking ? (
    <StatusDot tone="muted">Checking for updates…</StatusDot>
  ) : available ? (
    <StatusDot tone="accent">vIDE v{available.version} is available</StatusDot>
  ) : checkFailed ? (
    <StatusDot tone="bad">Couldn't reach GitHub. Check your connection and try again.</StatusDot>
  ) : (
    <StatusDot tone="good">Up to date{lastCheckedAt ? ` · checked ${formatCheckedAgo(lastCheckedAt, now)}` : ''}</StatusDot>
  )

  const release = releases?.find((r) => r.version === selected) ?? null
  // Releases this update brought in: newer than the version it replaced, up
  // to the one now running (more than one if releases were skipped).
  const updatedFrom = justUpdated && justUpdated.to === current ? justUpdated.from : null
  const isNew = (version: string) =>
    !!updatedFrom && isNewerVersion(version, updatedFrom) && !(current && isNewerVersion(version, current))

  return (
    // A flex column so Release history can take whatever height is left.
    // Capped at the same width as the other settings pages.
    <div className="flex h-full flex-col overflow-auto p-6 bg-panel">
      <div className="flex w-full max-w-[1000px] flex-1 flex-col">
        <h1 className="text-base font-semibold text-fg mb-1">About</h1>
        <p className="text-sm text-fg-muted mb-4">Your version of vIDE, updates, and every release so far.</p>

        <FeatureBlock title="Version" description="The vIDE you're running, and whether a newer one is out.">
          <div className="max-w-[640px] pt-1">
            <div className="flex items-center gap-4">
              <img src={appIconUrl} alt="vIDE" className="h-12 w-12 shrink-0" draggable={false} />
              <div className="min-w-0 flex-1">
                <div data-testid="about-version" className="text-[0.9375rem] font-semibold text-fg">
                  vIDE {current && <span className="text-accent">{current}</span>}
                </div>
                {justUpdated && justUpdated.to === current && (
                  <div data-testid="about-updated-from" className="mt-0.5 text-xs text-fg-muted">
                    {updatedFrom ? <>Updated from v{updatedFrom}</> : <>Just updated</>}
                  </div>
                )}
                <div className="mt-0.5">{statusLine}</div>
              </div>
              <button
                type="button"
                onClick={() => void checkForUpdates()}
                disabled={checking}
                className="flex h-8 shrink-0 items-center gap-2 rounded-sm border border-border px-3 text-sm text-fg transition-colors hover:border-fg-subtle disabled:cursor-default disabled:text-fg-muted disabled:hover:border-border"
              >
                {checking ? <span className="update-check-spin h-3 w-3 rounded-full border-2 border-fg-subtle border-t-accent" /> : <RefreshIcon />}
                {checking ? 'Checking…' : 'Check for updates'}
              </button>
            </div>

            {available && (
              <div data-testid="about-update-banner" className="mt-3 flex items-center gap-3 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2.5">
                <div className="min-w-0 flex-1 text-sm text-fg">
                  {status === 'ready' ? `v${available.version} is installed` : status === 'updating' ? `Updating to v${available.version}…` : `vIDE v${available.version} is ready to install`}
                  <div className="mt-0.5 text-xs text-fg-muted">
                    {status === 'ready' ? 'Restart vIDE to start using it.' : 'It downloads and installs on the Update page, then asks you to restart.'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={status === 'idle' || status === 'failed' ? startUpdate : openUpdatePage}
                  className="h-8 shrink-0 rounded-full border border-accent bg-accent px-4 text-sm font-semibold text-on-accent"
                >
                  {status === 'idle' || status === 'failed' ? `Update to v${available.version}` : 'Open Update page'}
                </button>
              </div>
            )}
          </div>
        </FeatureBlock>

        {/* Same heading and divider as FeatureBlock, but stretched to the
            bottom of the page so the notes fill the viewer. */}
        <section aria-label="Release history" className="flex min-h-[20rem] flex-1 flex-col border-t border-border py-6">
          <h2 className="text-sm font-semibold text-fg">Release history</h2>
          <p className="mb-3 mt-0.5 text-xs text-fg-muted">Every release so far. New ones from your last update are marked.</p>
          <div className="flex min-h-0 flex-1 flex-col">
            {releases === null ? (
              <p className="text-sm text-fg-subtle">Loading releases…</p>
            ) : releases.length === 0 ? (
              <p className="text-sm text-fg-subtle">No release notes found.</p>
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)] overflow-hidden rounded-lg border border-border">
                <div role="listbox" aria-label="Releases" className="overflow-y-auto border-r border-border bg-sidebar">
                  {releases.map((r) => {
                    const isSelected = r.version === selected
                    return (
                      <button
                        key={r.version}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => setSelected(r.version)}
                        className={[
                          'flex w-full items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-left text-sm transition-colors',
                          isSelected ? 'bg-accent/10 text-fg' : 'text-fg-muted hover:bg-white/5 hover:text-fg',
                        ].join(' ')}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className={r.version === current ? 'text-accent' : undefined}>v{r.version}</span>
                          {isNew(r.version) && (
                            <span data-testid="about-release-new" className="rounded-full bg-accent/15 px-1.5 text-[0.625rem] font-semibold uppercase tracking-wider text-accent">New</span>
                          )}
                        </span>
                        <span className="text-xs text-fg-subtle">{formatReleaseDate(r.date)}</span>
                      </button>
                    )
                  })}
                </div>
                <div data-testid="about-release-notes" className="overflow-y-auto px-6 py-5">
                  {release && (
                    <>
                      <div className="mb-5 flex items-baseline gap-3 border-b border-border/60 pb-3">
                        <span className={['text-lg font-semibold', release.version === current ? 'text-accent' : 'text-fg'].join(' ')}>v{release.version}</span>
                        <span className="text-sm text-fg-subtle">{formatReleaseDate(release.date)}</span>
                      </div>
                      <ReleaseNotesView body={release.body} />
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

// Inline markdown only (bold, `code`) — each note is a single line, so no
// paragraph wrappers.
function InlineMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children: inner }) => <>{inner}</>,
        code: ({ children: inner }) => <code className="rounded-sm border border-border bg-bg px-1 text-[0.85em] text-fg">{inner}</code>,
        strong: ({ children: inner }) => <strong className="font-semibold text-fg">{inner}</strong>,
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

// One release's notes, laid out for reading: each titled change as a name
// with its description under it, then the untitled changes and bug fixes
// as short lists. The page's max width keeps the lines a readable length.
// Falls back to plain markdown for notes that aren't "- " entries.
function ReleaseNotesView({ body }: { body: string }) {
  const notes = parseReleaseNotes(body)
  if (notes.features.length + notes.changes.length + notes.fixes.length === 0) {
    return (
      <div className={[COMPACT_PROSE_CLASSES, 'px-0! py-0!'].join(' ')}>
        <ReactMarkdown>{body}</ReactMarkdown>
      </div>
    )
  }
  const listHeading = (label: string) => (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">{label}</h3>
  )
  const bulletList = (items: string[], testId: string) => (
    <ul data-testid={testId} className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-fg-muted">
          <span className="mt-[0.6rem] h-1 w-1 shrink-0 rounded-full bg-fg-subtle" />
          <span><InlineMarkdown>{item}</InlineMarkdown></span>
        </li>
      ))}
    </ul>
  )
  return (
    <div className="flex flex-col gap-6">
      {notes.features.length > 0 && (
        <div data-testid="release-features" className="flex flex-col gap-4">
          {notes.features.map((f) => (
            <div key={f.title} className="flex gap-3">
              <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-fg">{f.title}</div>
                {f.text && <p className="mt-0.5 text-sm leading-relaxed text-fg-muted"><InlineMarkdown>{f.text}</InlineMarkdown></p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {notes.changes.length > 0 && (
        <div>
          {notes.features.length > 0 && listHeading('Other changes')}
          {bulletList(notes.changes, 'release-changes')}
        </div>
      )}
      {notes.fixes.length > 0 && (
        <div>
          {listHeading('Bug fixes')}
          {bulletList(notes.fixes, 'release-fixes')}
        </div>
      )}
    </div>
  )
}

function StatusDot({ tone, children }: { tone: 'good' | 'accent' | 'bad' | 'muted'; children: React.ReactNode }) {
  const dot = { good: 'bg-green-500', accent: 'bg-accent', bad: 'bg-red-400', muted: 'bg-fg-subtle' }[tone]
  return (
    <span className={['flex items-center gap-1.5 text-xs', tone === 'bad' ? 'text-red-400' : 'text-fg-muted'].join(' ')}>
      <span className={['h-1.5 w-1.5 shrink-0 rounded-full', dot].join(' ')} />
      {children}
    </span>
  )
}

function RefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 4v5h.6m15.4 2A8 8 0 0 0 4.6 9m0 0H9m11 11v-5h-.6m0 0a8 8 0 0 1-15.4-2m15.4 2H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
