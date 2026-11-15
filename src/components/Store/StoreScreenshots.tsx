import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCoverNativeViews } from '@/lib/nativeViewCover'

// A row of the app's screenshots; click one to enlarge it. Renders nothing
// when there are none (and drops any image that fails to load), so an app
// without screenshots shows no strip and no empty boxes.
export function StoreScreenshots({ urls, name }: { urls: string[] | undefined; name: string }) {
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<string | null>(null)
  const shown = (urls ?? []).filter((u) => !failed.has(u))
  if (shown.length === 0) return null
  return (
    <>
      <div role="list" aria-label="Screenshots" className="flex gap-3 overflow-x-auto pb-1">
        {shown.map((url, i) => (
          <div key={url} role="listitem" className="shrink-0">
          <button
            type="button"
            aria-label={`Enlarge screenshot ${i + 1} of ${name}`}
            onClick={() => setOpen(url)}
            className="rounded-[10px] border border-border overflow-hidden bg-panel cursor-zoom-in hover:border-accent/45 transition-colors"
          >
            <img
              src={url}
              alt={`${name} screenshot ${i + 1}`}
              draggable={false}
              onError={() => setFailed((f) => new Set(f).add(url))}
              className="block h-[180px] w-auto max-w-[420px] object-cover"
            />
          </button>
          </div>
        ))}
      </div>
      {open && <Lightbox url={open} alt={`${name} screenshot`} onClose={() => setOpen(null)} />}
    </>
  )
}

function Lightbox({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  // Browser tabs are native views that paint over any DOM; cover them.
  useCoverNativeViews()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div
      role="dialog"
      aria-label="Screenshot"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8 cursor-zoom-out"
      onMouseDown={onClose}
    >
      <img src={url} alt={alt} className="max-w-full max-h-full rounded-lg shadow-2xl shadow-black/60" />
    </div>,
    document.body,
  )
}
