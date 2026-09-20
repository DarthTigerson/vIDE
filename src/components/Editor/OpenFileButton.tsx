import { useFileExists } from './useFileExists'
import { openFileInTree } from '@/lib/openFileInTree'

// Sits at the right edge of a diff tab's breadcrumb, mirroring the markdown
// "Open Preview" button: opens the real file next to the diff and shows it in
// the file tree. Renders nothing when the file no longer exists on disk.
export function OpenFileButton({ absPath, paneId, refreshKey }: {
  absPath: string
  paneId: string
  refreshKey?: unknown
}) {
  const exists = useFileExists(absPath, refreshKey)
  if (!exists) return null

  return (
    <button
      type="button"
      onClick={() => { void openFileInTree(absPath, paneId).catch((error) => console.error('Open file failed', error)) }}
      className="px-2.5 h-full border-l border-border bg-white/5 text-[0.6875rem] font-medium text-fg-muted hover:text-fg hover:bg-accent/20 transition-colors"
    >
      Open File
    </button>
  )
}
