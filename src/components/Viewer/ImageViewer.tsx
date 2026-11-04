import { useEffect, useState } from 'react'
import { needsImageConversion } from '@/lib/fileKinds'

export const CHECKERBOARD_BACKGROUND = {
  backgroundImage: [
    'linear-gradient(45deg, rgba(128,128,128,0.15) 25%, transparent 25%)',
    'linear-gradient(-45deg, rgba(128,128,128,0.15) 25%, transparent 25%)',
    'linear-gradient(45deg, transparent 75%, rgba(128,128,128,0.15) 75%)',
    'linear-gradient(-45deg, transparent 75%, rgba(128,128,128,0.15) 75%)',
  ].join(', '),
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
}

export function ImageViewer({ path }: { path: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  // A TIFF/HEIC the OS couldn't decode (e.g. HEIC on Linux): said plainly
  // instead of showing a broken image.
  const [unsupported, setUnsupported] = useState(false)
  const name = path.split('/').pop() ?? path

  useEffect(() => {
    let cancelled = false
    setDataUrl(null)
    setError(false)
    setUnsupported(false)
    const load = needsImageConversion(path) ? window.api.readImagePngDataUrl : window.api.readImageDataUrl
    load(path).then(
      (url) => {
        if (cancelled) return
        if (url) setDataUrl(url)
        else setUnsupported(true)
      },
      () => { if (!cancelled) setError(true) }
    )
    return () => { cancelled = true }
  }, [path])

  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 overflow-auto bg-panel p-6">
      {unsupported ? (
        <p className="text-sm text-fg-subtle">Preview not available for this format on this system</p>
      ) : error ? (
        <p className="text-sm text-fg-subtle">Couldn't load {name}</p>
      ) : dataUrl ? (
        <>
          <div
            className="flex items-center justify-center rounded border border-border/60 p-2 max-w-full max-h-full"
            style={CHECKERBOARD_BACKGROUND}
          >
            <img src={dataUrl} alt={name} className="max-w-full max-h-[70vh] object-contain" />
          </div>
          <p className="text-xs text-fg-subtle font-mono truncate max-w-full">{name}</p>
        </>
      ) : (
        <p className="text-sm text-fg-subtle">Loading…</p>
      )}
    </div>
  )
}
