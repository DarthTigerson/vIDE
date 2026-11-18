// Hover panel with a line's blame details, shared by the footer blame
// (StatusBar/FooterBlame.tsx) and the in-editor one (Editor/currentLineBlame.ts).
// Pure CSS hover: the parent must carry `group relative`. Styled like
// TodoTrashPage's hover labels. The parent can set `--blame-panel-x` to line
// the panel up with the mouse (the in-editor blame does); it defaults to 0.
export interface BlameDetails {
  author: string
  summary: string
  // Exact "YYYY-MM-DD HH:MM:SS" and relative ("15d ago") forms of the commit time.
  date: string
  relDate: string
}

export function BlameDetailsPanel({ author, summary, date, relDate, placement }: BlameDetails & { placement: 'above' | 'below' }) {
  return (
    <div
      role="tooltip"
      aria-label="Blame details"
      data-placement={placement}
      style={{ left: 'var(--blame-panel-x, 0px)' }}
      className={[
        'pointer-events-none absolute z-50 w-max max-w-md rounded-sm bg-black/90 px-3 py-2',
        'font-sans text-xs text-gray-200 whitespace-normal opacity-0 transition-opacity duration-100 delay-150 group-hover:opacity-100',
        placement === 'above' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
      ].join(' ')}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-gray-400">Author</dt>
        <dd>{author}</dd>
        <dt className="text-gray-400">Date</dt>
        <dd className="tabular-nums">
          {date} <span className="text-gray-400">({relDate})</span>
        </dd>
        <dt className="text-gray-400">Message</dt>
        <dd className="whitespace-pre-wrap break-words">{summary}</dd>
      </dl>
    </div>
  )
}
