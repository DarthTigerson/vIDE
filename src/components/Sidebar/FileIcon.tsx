interface IconSpec {
  label: string
  bg: string
  color?: string
}

const EXACT: Record<string, IconSpec> = {
  'package.json': { label: '{}', bg: '#cb8b3e' },
  'package-lock.json': { label: 'LK', bg: '#4b4b4b' },
  'pnpm-lock.yaml': { label: 'LK', bg: '#4b4b4b' },
  'yarn.lock': { label: 'LK', bg: '#4b4b4b' },
  'tsconfig.json': { label: 'TS', bg: '#3178c6' },
  dockerfile: { label: 'DK', bg: '#2496ed' },
}

const EXT: Record<string, IconSpec> = {
  ts: { label: 'TS', bg: '#3178c6' },
  tsx: { label: 'TSX', bg: '#3178c6' },
  js: { label: 'JS', bg: '#e8c94c', color: '#1a1a1a' },
  jsx: { label: 'JSX', bg: '#e8c94c', color: '#1a1a1a' },
  css: { label: 'CS', bg: '#3a7ebf' },
  scss: { label: 'SC', bg: '#c06ab0' },
  html: { label: 'HT', bg: '#dd5541' },
  json: { label: '{}', bg: '#cb8b3e' },
  md: { label: 'MD', bg: '#3a7ebf' },
  py: { label: 'PY', bg: '#3a7ebf' },
  rs: { label: 'RS', bg: '#c9622f' },
  go: { label: 'GO', bg: '#3aa8c1' },
  yml: { label: 'YM', bg: '#c14c4c' },
  yaml: { label: 'YM', bg: '#c14c4c' },
  sh: { label: '>_', bg: '#4b4b4b' },
  svg: { label: 'SV', bg: '#cb8b3e' },
  png: { label: 'IMG', bg: '#7d5ba6' },
  jpg: { label: 'IMG', bg: '#7d5ba6' },
  jpeg: { label: 'IMG', bg: '#7d5ba6' },
  gif: { label: 'IMG', bg: '#7d5ba6' },
  toml: { label: 'TM', bg: '#5a5a5a' },
  lock: { label: 'LK', bg: '#4b4b4b' },
}

const DEFAULT: IconSpec = { label: '•', bg: '#5a5a5a' }

function iconSpecFor(name: string): IconSpec {
  const lower = name.toLowerCase()
  if (EXACT[lower]) return EXACT[lower]
  if (lower.startsWith('.env')) return { label: '.E', bg: '#4c9a2a' }
  if (lower.startsWith('.git')) return { label: 'GI', bg: '#e0524d' }
  const ext = lower.includes('.') ? lower.split('.').pop()! : ''
  return EXT[ext] ?? DEFAULT
}

export function FileIcon({ name, scale = 1 }: { name: string; scale?: number }) {
  const { label, bg, color } = iconSpecFor(name)
  return (
    <span
      className="shrink-0 flex items-center justify-center rounded-[3px] font-bold leading-none tracking-tighter"
      style={{
        width: `${1.125 * scale}rem`,
        height: `${0.9375 * scale}rem`,
        fontSize: `${0.5 * scale}rem`,
        background: bg,
        color: color ?? '#fff',
      }}
    >
      {label}
    </span>
  )
}

// Fixed icon for browser tabs — unlike FileIcon (built for editor file
// tabs, which sniffs a trailing ".ext" off the given name), a browser tab's
// "name" is the page's title, which has no reliable relationship to a file
// type. Sniffing it anyway produced misleading badges (e.g. a page titled
// "app.js" got the JS file icon), so browser tabs always get this instead.
export function BrowserTabIcon({ scale = 1 }: { scale?: number }) {
  return (
    <svg
      className="shrink-0"
      width={`${0.9375 * scale}rem`}
      height={`${0.9375 * scale}rem`}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 12h18" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.5-4-9s1.5-6.5 4-9z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export function FolderIcon({ open, scale = 1 }: { open: boolean; scale?: number }) {
  return (
    <svg
      className="shrink-0"
      width={`${0.9375 * scale}rem`}
      height={`${0.9375 * scale}rem`}
      viewBox="0 0 24 24"
      fill={open ? '#e8c94c' : '#c9a227'}
    >
      {open ? (
        <path d="M3 7a2 2 0 0 1 2-2h4.5l2 2H19a2 2 0 0 1 2 2v.5H6.5a2.5 2.5 0 0 0-2.45 1.97L2.6 17.4A1 1 0 0 1 1 17V7Z M4.86 20a2 2 0 0 0 1.94 1.5H19a2 2 0 0 0 1.94-1.53l1.8-7.5A1 1 0 0 0 21.77 11H6.5a1 1 0 0 0-.97.78L3.6 19.5" />
      ) : (
        <path d="M3 6a2 2 0 0 1 2-2h4.5l2 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />
      )}
    </svg>
  )
}
