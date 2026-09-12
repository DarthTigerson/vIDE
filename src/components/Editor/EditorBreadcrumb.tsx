import type { ReactNode } from 'react'
import { toRelativePath } from '@/lib/sendSelectionToAssistant'
import { FileIcon, FolderIcon } from '@/components/Sidebar/FileIcon'

interface Props {
  path: string
  projectRoot: string | null
  // Rendered pinned to the right edge, e.g. the Markdown editor/preview
  // toggle button — kept out of the scrollable segments list so it's never
  // scrolled out of view by a long path.
  right?: ReactNode
}

function ChevronIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" className="shrink-0 text-fg-subtle">
      <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function EditorBreadcrumb({ path, projectRoot, right }: Props) {
  const segments = toRelativePath(path, projectRoot).split('/').filter(Boolean)
  const lastIndex = segments.length - 1

  return (
    <div className="flex items-stretch justify-between gap-2 h-6 pl-3 bg-panel shrink-0 select-none">
      <div className="flex items-center gap-1 text-[0.6875rem] overflow-x-auto whitespace-nowrap min-w-0">
        {segments.map((segment, i) => {
          const isLast = i === lastIndex
          return (
            <span key={i} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ChevronIcon />}
              {isLast ? <FileIcon name={segment} scale={0.75} /> : <FolderIcon open={false} scale={0.75} />}
              <span className={isLast ? 'text-fg font-medium' : 'text-fg-subtle'}>{segment}</span>
            </span>
          )
        })}
      </div>
      {right && <div className="shrink-0 flex">{right}</div>}
    </div>
  )
}
