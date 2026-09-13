import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { PROSE_CLASSES } from './proseClasses'
import { useEditorStore } from '@/stores/editorStore'

export function MarkdownViewer({ path }: { path: string }) {
  // Editor + preview split view opens the raw file as its own editor tab
  // alongside this preview tab, and that tab's `content` is kept live on
  // every keystroke (editorStore's updateContent), so reading it here makes
  // edits show immediately — without this, the preview only ever showed a
  // one-time disk read from mount, so it needed a close/reopen to pick up
  // any change. Falls back to reading the file from disk when there's no
  // matching editor tab open, e.g. Notes/Graphify open a preview tab on its
  // own for read-only docs, with no editor tab alongside it.
  const liveContent = useEditorStore((s) => s.tabs.find((t) => t.path === path)?.content)
  const [diskContent, setDiskContent] = useState<string | null>(null)
  const [error, setError] = useState(false)
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
    <div className="h-full overflow-auto bg-panel">
      <div className={PROSE_CLASSES}>
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  )
}
