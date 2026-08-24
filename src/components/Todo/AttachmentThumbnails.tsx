import { useEffect, useState } from 'react'

export function AttachmentThumbnails({
  attachments,
  onRemove,
}: {
  attachments: string[]
  onRemove?: (id: string) => void
}) {
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    attachments.forEach((id) => {
      window.api.todosReadAttachmentDataUrl(id).then((url) => {
        if (!cancelled) setUrls((prev) => ({ ...prev, [id]: url }))
      })
    })
    return () => {
      cancelled = true
    }
  }, [attachments])

  if (attachments.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((id) => (
        <div key={id} className="relative group w-20 h-20">
          {urls[id] ? (
            <img
              src={urls[id]}
              alt="Pasted screenshot"
              className="w-20 h-20 object-cover rounded border border-border"
            />
          ) : (
            <div className="w-20 h-20 rounded border border-border/60 bg-panel animate-pulse" />
          )}
          {onRemove && (
            <button
              type="button"
              aria-label="Remove attachment"
              onClick={() => onRemove(id)}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-black/70 text-white text-[0.6rem] leading-4 text-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
