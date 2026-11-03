import type { MouseEvent } from 'react'
import type { GitFileEntry } from '@/types/index'

const STATUS_COLOR: Record<GitFileEntry['status'], string> = {
  M: 'text-amber-400',
  A: 'text-green-400',
  D: 'text-red-400',
  R: 'text-blue-400',
  '?': 'text-fg-subtle',
}

interface FileRowProps {
  file: GitFileEntry
  staged: boolean
  onToggle: () => void
  onOpenDiff: () => void
  onContextMenu: (event: MouseEvent<HTMLDivElement>) => void
}

export function FileRow({ file, staged, onToggle, onOpenDiff, onContextMenu }: FileRowProps) {
  // A trailing slash is a folder entry (a nested repo, `?? nested/`): name it
  // by the folder, slash kept, rather than the empty last segment.
  const name = file.path.endsWith('/')
    ? `${file.path.slice(0, -1).split('/').pop()}/`
    : file.path.split('/').pop() ?? file.path

  return (
    <div
      className="group flex items-center gap-1.5 px-3 py-0.5 rounded hover:bg-white/5"
      onContextMenu={onContextMenu}
    >
      <button
        type="button"
        onClick={onOpenDiff}
        title={file.path}
        className="flex items-center gap-1.5 flex-1 min-w-0 text-left text-sm"
      >
        <span className={`w-3 shrink-0 text-xs font-semibold ${STATUS_COLOR[file.status]}`}>
          {file.status}
        </span>
        <span className="truncate text-fg">{name}</span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        aria-label={staged ? 'Unstage' : 'Stage'}
        className="shrink-0 w-4 h-4 flex items-center justify-center text-fg-muted opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"
      >
        {staged ? '−' : '+'}
      </button>
    </div>
  )
}
