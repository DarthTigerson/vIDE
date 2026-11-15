import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { COMPACT_PROSE_CLASSES } from '@/components/Viewer/proseClasses'
import { openUrlInBrowserTab } from '@/components/Chat/terminalLinks'

// The "About" section: the app's README, fetched by the main process from the
// catalog's readmeUrl (size- and time-limited, cached per version). Hidden
// entirely when there is no README, it fails to load, or it is empty. Raw HTML
// in the README is never rendered (react-markdown's default, no rehype-raw).
export function StoreReadme({ appId, hasReadme, version }: { appId: string; hasReadme: boolean; version: string }) {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    setText(null)
    if (!hasReadme || typeof window.api?.storeGetReadme !== 'function') return
    let cancelled = false
    void window.api.storeGetReadme(appId).then((res) => {
      if (!cancelled && res.ok) setText(res.text)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [appId, hasReadme, version])

  if (!text || text.trim() === '') return null
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-[0.625rem] font-bold tracking-wider uppercase text-fg-subtle">About</h2>
      <div className={['bg-panel border border-border rounded-[10px] p-4', COMPACT_PROSE_CLASSES, '!max-w-none !px-4 !py-4'].join(' ')}>
        <ReactMarkdown
          components={{
            a: ({ href, children }) => {
              const web = typeof href === 'string' && /^https?:\/\//i.test(href)
              return (
                <a
                  href={web ? href : undefined}
                  onClick={(e) => {
                    e.preventDefault()
                    if (web) openUrlInBrowserTab(href)
                  }}
                  className="cursor-pointer"
                >
                  {children}
                </a>
              )
            },
            // Only https images; a relative or other-scheme image is dropped.
            img: ({ src, alt }) =>
              typeof src === 'string' && src.startsWith('https://')
                ? <img src={src} alt={alt ?? ''} className="max-w-full rounded" />
                : null,
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    </section>
  )
}
