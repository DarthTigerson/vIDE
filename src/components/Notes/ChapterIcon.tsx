export function ChapterIcon({ open, scale = 1 }: { open: boolean; scale?: number }) {
  return (
    <svg
      className="shrink-0"
      width={`${0.9375 * scale}rem`}
      height={`${0.9375 * scale}rem`}
      viewBox="0 0 24 24"
      fill={open ? '#e8c94c' : 'none'}
    >
      <path
        d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"
        stroke={open ? '#e8c94c' : '#c9a227'}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
