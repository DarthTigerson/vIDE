import { useEffect, useState } from 'react'
import { useEditorStore } from '@/stores/editorStore'
import { CHECKERBOARD_BACKGROUND } from './ImageViewer'

// Renders through <img> rather than inline SVG, so scripts inside the file
// never run in the app's DOM.
export function SvgViewer({ path }: { path: string }) {
  // Like MarkdownViewer: the file's editor tab keeps its content live on every
  // keystroke, so the preview follows unsaved edits; with no editor tab open
  // it reads the file from disk.
  const liveContent = useEditorStore((s) => s.tabs.find((t) => t.path === path)?.content)
  const [diskContent, setDiskContent] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [renderFailed, setRenderFailed] = useState(false)
  const name = path.split('/').pop() ?? path
  const hasLiveContent = liveContent !== undefined

  useEffect(() => {
    if (hasLiveContent) return
    let cancelled = false
    setDiskContent(null)
    setError(false)
    window.api.readFile(path).then(
      (text) => { if (!cancelled) setDiskContent(text) },
      () => { if (!cancelled) setError(true) }
    )
    return () => { cancelled = true }
  }, [path, hasLiveContent])

  const content = liveContent ?? diskContent

  // A new edit gets another chance to render after a broken one.
  useEffect(() => { setRenderFailed(false) }, [content])

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-fg-subtle">Couldn't load {name}</p>
      </div>
    )
  }

  if (content === null) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-fg-subtle">Loading…</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 overflow-auto bg-panel p-6">
      {renderFailed ? (
        <p className="text-sm text-fg-subtle">Couldn't render {name}. Check the SVG source for errors.</p>
      ) : (
        <>
          <div
            className="flex items-center justify-center rounded border border-border/60 p-2 max-w-full max-h-full"
            style={CHECKERBOARD_BACKGROUND}
          >
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`}
              alt={name}
              onError={() => setRenderFailed(true)}
              className="max-w-full max-h-[70vh] object-contain"
            />
          </div>
          <p className="text-xs text-fg-subtle font-mono truncate max-w-full">{name}</p>
        </>
      )}
    </div>
  )
}
