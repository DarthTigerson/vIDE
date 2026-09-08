import { useBrowserFavoritesStore } from '@/stores/browserFavoritesStore'
import { useBrowserRecentStore } from '@/stores/browserRecentStore'
import { useBrowserClosedTabsStore } from '@/stores/browserClosedTabsStore'
import { StarIcon } from './StarIcon'
import { formatRelativeTime } from './formatRelativeTime'

interface Props {
  onNavigate: (url: string) => void
}

function monogram(title: string, url: string): string {
  const source = (title || url).replace(/^https?:\/\//, '')
  return source.slice(0, 2).toUpperCase()
}

export function BrowserLandingPage({ onNavigate }: Props) {
  const favorites = useBrowserFavoritesStore((s) => s.favorites)
  const toggleFavorite = useBrowserFavoritesStore((s) => s.toggleFavorite)
  const recent = useBrowserRecentStore((s) => s.entries)
  const closed = useBrowserClosedTabsStore((s) => s.entries)
  const removeClosedEntry = useBrowserClosedTabsStore((s) => s.removeEntry)

  const favoriteList = Object.values(favorites).sort((a, b) => b.favoritedAt - a.favoritedAt)

  // Reopening a closed tab un-closes it, so it stops being listed here — the
  // row body and its hover-revealed restore icon both do exactly this.
  function reopenClosed(url: string) {
    onNavigate(url)
    removeClosedEntry(url)
  }

  return (
    <div className="absolute inset-0 grid grid-cols-[260px_1fr] overflow-hidden bg-bg">
      <div className="overflow-auto border-r border-border bg-sidebar px-4 py-5">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">Favorites</p>
        {favoriteList.length === 0 ? (
          <div className="rounded border border-dashed border-border px-3 py-2.5 text-xs leading-relaxed text-fg-subtle">
            Star the address bar on any page to pin it here.
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {favoriteList.map((fav) => (
              <div key={fav.url} className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-white/5">
                <button
                  type="button"
                  onClick={() => onNavigate(fav.url)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-accent text-[9px] font-semibold text-on-accent">
                    {monogram(fav.title, fav.url)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-fg">{fav.title || fav.url}</span>
                    <span className="block truncate text-[10.5px] text-fg-subtle">{fav.url}</span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${fav.title || fav.url} from favorites`}
                  onClick={() => toggleFavorite(fav.url, fav.title)}
                  className="shrink-0 text-accent opacity-0 hover:text-fg group-hover:opacity-100"
                >
                  <StarIcon filled />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-auto px-5 py-5">
        <section>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">Recent</p>
          {recent.length === 0 ? (
            <p className="text-xs text-fg-subtle">Nothing here yet.</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {recent.map((entry) => {
                const isFav = !!favorites[entry.url]
                return (
                  <div key={entry.url} className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-white/5">
                    <button
                      type="button"
                      onClick={() => onNavigate(entry.url)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-border bg-tab-bar text-[9px] font-semibold text-fg-muted">
                        {monogram(entry.title, entry.url)}
                      </span>
                      <span className="flex min-w-0 flex-1 items-baseline gap-2">
                        <span className="shrink truncate text-xs text-fg">{entry.title || entry.url}</span>
                        <span className="min-w-0 flex-1 truncate text-[10.5px] text-fg-subtle">{entry.url}</span>
                      </span>
                    </button>
                    <span className="shrink-0 text-[10px] tabular-nums text-fg-subtle">
                      {formatRelativeTime(entry.visitedAt)}
                    </span>
                    <button
                      type="button"
                      aria-label={isFav ? `Remove ${entry.title} from favorites` : `Add ${entry.title} to favorites`}
                      onClick={() => toggleFavorite(entry.url, entry.title)}
                      className={
                        isFav
                          ? 'shrink-0 text-accent opacity-100'
                          : 'shrink-0 text-fg-subtle opacity-0 hover:text-accent group-hover:opacity-100'
                      }
                    >
                      <StarIcon filled={isFav} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="mt-6">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">Closed tabs</p>
          {closed.length === 0 ? (
            <p className="text-xs text-fg-subtle">No recently closed tabs.</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {closed.map((entry) => (
                <div key={entry.url} className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-white/5">
                  <button
                    type="button"
                    onClick={() => reopenClosed(entry.url)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-border bg-tab-bar text-[9px] font-semibold text-fg-muted">
                      {monogram(entry.title, entry.url)}
                    </span>
                    <span className="flex min-w-0 flex-1 items-baseline gap-2">
                      <span className="shrink truncate text-xs text-fg">{entry.title || entry.url}</span>
                      <span className="min-w-0 flex-1 truncate text-[10.5px] text-fg-subtle">{entry.url}</span>
                    </span>
                  </button>
                  <span className="shrink-0 text-[10px] tabular-nums text-fg-subtle">
                    closed {formatRelativeTime(entry.closedAt)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Reopen ${entry.title || entry.url}`}
                    onClick={() => reopenClosed(entry.url)}
                    className="shrink-0 text-fg-subtle opacity-0 hover:text-fg group-hover:opacity-100"
                  >
                    <RestoreIcon />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function RestoreIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 12a9 9 0 1 0 3-6.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 3v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
