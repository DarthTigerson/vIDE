export function BookIcon({ open, scale = 1 }: { open: boolean; scale?: number }) {
  return (
    <svg
      className="shrink-0"
      width={`${0.9375 * scale}rem`}
      height={`${0.9375 * scale}rem`}
      viewBox="0 0 24 24"
      fill="none"
    >
      {open ? (
        <>
          <path
            d="M12 5c-2-1.5-5-2-9-1v15c4-1 7-.5 9 1 2-1.5 5-2 9-1V4c-4-1-7-.5-9 1Z"
            stroke="#e8c94c"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M12 5v15" stroke="#e8c94c" strokeWidth="1.5" />
        </>
      ) : (
        <>
          <path
            d="M4 4.5A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 0 4 23.5V4.5Z"
            stroke="#c9a227"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="#c9a227" strokeWidth="1.5" strokeLinejoin="round" />
        </>
      )}
    </svg>
  )
}
