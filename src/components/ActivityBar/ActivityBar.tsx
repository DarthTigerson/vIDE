import React from 'react'

export interface ActivityBarItem {
  id: string
  icon: React.ReactNode
  title: string
  active: boolean
  badge?: string | number
  disabled?: boolean
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  onContextMenu?: (event: React.MouseEvent) => void
  // Shown beside the icon in a `wide` bar (e.g. a Claude session's name).
  label?: string
  // When set, the row renders an inline rename input instead of the button.
  rename?: { initial: string; onCommit: (value: string) => void; onCancel: () => void }
  // Set on items the user may drag to reorder (agent sessions); the bar's
  // onReorder receives these ids.
  dragId?: string
}

type DropPlacement = 'before' | 'after'
type ReorderHandler = (dragId: string, targetId: string, placement: DropPlacement) => void

interface ActivityBarProps {
  side: 'left' | 'right'
  groups: ActivityBarItem[][]
  bottomGroups?: ActivityBarItem[][]
  showAccent?: boolean
  dense?: boolean
  // Widen the bar and show each item's label next to its icon.
  wide?: boolean
  // Icons only at rest; widen (as an overlay) while hovered.
  expandOnHover?: boolean
  // A grip on the bar's inner border, near the bottom, that toggles it.
  edgeToggle?: { label: string; onClick: () => void }
  onReorder?: ReorderHandler
}

const DRAG_MIME = 'application/x-vide-session'

function placementFor(e: React.DragEvent<HTMLElement>): DropPlacement {
  const rect = e.currentTarget.getBoundingClientRect()
  return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

// Three-dot grip straddling the bar's inner border. The button is wider than
// the pill so the thin target is still easy to hit.
function EdgeGrip({ side, toggle }: { side: 'left' | 'right'; toggle: NonNullable<ActivityBarProps['edgeToggle']> }) {
  return (
    <button
      type="button"
      aria-label={toggle.label}
      title={toggle.label}
      onClick={toggle.onClick}
      className={[
        'group absolute bottom-6 z-10 flex h-8 w-3 items-center justify-center',
        side === 'left' ? '-right-1.5' : '-left-1.5',
      ].join(' ')}
    >
      <span className="flex h-[22px] w-[5px] flex-col items-center justify-center gap-[2px] rounded-full border border-border bg-black transition-colors group-hover:border-accent group-hover:bg-accent">
        <span className="h-[2px] w-[2px] rounded-full bg-fg-subtle group-hover:bg-black" />
        <span className="h-[2px] w-[2px] rounded-full bg-fg-subtle group-hover:bg-black" />
        <span className="h-[2px] w-[2px] rounded-full bg-fg-subtle group-hover:bg-black" />
      </span>
    </button>
  )
}

function RenameRow({ item, dense }: { item: ActivityBarItem; dense: boolean }) {
  const rename = item.rename!
  const [value, setValue] = React.useState(rename.initial)
  // Enter/Escape unmount the input, which can fire a trailing blur — make
  // sure only the first of commit/cancel wins.
  const done = React.useRef(false)
  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    if (commit) rename.onCommit(value)
    else rename.onCancel()
  }
  return (
    <div className={['flex items-center gap-2 w-full px-3', dense ? 'h-8' : 'h-12'].join(' ')}>
      <span className="flex w-6 shrink-0 justify-center">{item.icon}</span>
      <input
        autoFocus
        aria-label="Rename session"
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(true)
          else if (e.key === 'Escape') finish(false)
        }}
        onBlur={() => finish(true)}
        className="min-w-0 flex-1 rounded border border-accent bg-transparent px-1 text-xs text-fg outline-none"
      />
    </div>
  )
}

function ActivityBarButton({ item, showAccent, side, dense, wide, dropMarker, dragProps }: {
  item: ActivityBarItem
  showAccent: boolean
  side: 'left' | 'right'
  dense: boolean
  wide: boolean
  dropMarker?: DropPlacement
  dragProps?: React.HTMLAttributes<HTMLButtonElement> & { draggable?: boolean }
}) {
  if (wide && item.rename) return <RenameRow item={item} dense={dense} />
  // Wide rows show the label, or the title for items without one (Compact,
  // Clear, Usage…), so no row is a bare icon.
  const showLabel = wide
  return (
    <button
      key={item.id}
      {...dragProps}
      onClick={item.disabled ? undefined : (e) => item.onClick(e)}
      onContextMenu={item.disabled ? undefined : item.onContextMenu}
      aria-label={item.label ?? item.title}
      disabled={item.disabled}
      className={[
        'relative flex items-center transition-colors group disabled:cursor-not-allowed',
        wide ? 'w-full justify-start gap-2 px-3' : 'w-12 justify-center',
        wide && item.active ? 'bg-white/5' : '',
        dense ? 'h-8' : 'h-12',
      ].join(' ')}
    >
      {showAccent && item.active && !item.disabled && (
        <span
          className={[
            'absolute top-1 bottom-1 w-0.5 bg-accent rounded',
            side === 'left' ? 'left-0 rounded-r' : 'right-0 rounded-l',
          ].join(' ')}
        />
      )}
      <span
        className={[
          'transition-opacity',
          wide ? 'flex w-6 shrink-0 justify-center' : '',
          item.disabled
            ? 'text-fg-subtle opacity-30'
            : item.active
              ? 'text-fg opacity-100'
              : 'text-fg-muted opacity-50 group-hover:opacity-100 group-hover:text-accent',
        ].join(' ')}
      >
        {item.icon}
      </span>
      {showLabel && (
        <span
          className={[
            'min-w-0 truncate text-left text-xs',
            item.active ? 'text-fg' : 'text-fg-muted group-hover:text-fg',
          ].join(' ')}
        >
          {item.label ?? item.title}
        </span>
      )}
      {item.badge !== undefined && item.badge !== null && item.badge !== '' && (
        <span className="absolute right-1 bottom-1 min-w-4 h-4 rounded-full bg-accent px-1 text-[0.5625rem] font-bold leading-4 text-on-accent shadow shadow-black/40">
          {item.badge}
        </span>
      )}
      {!showLabel && <span
        className={[
          'pointer-events-none absolute z-50 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-black/90 px-2 py-1 text-xs text-gray-200 opacity-0 transition-opacity duration-100 delay-150 group-hover:opacity-100',
          side === 'left' ? 'left-full ml-2' : 'right-full mr-2',
        ].join(' ')}
      >
        {item.label ?? item.title}
      </span>}
      {dropMarker && (
        <span className={['pointer-events-none absolute left-2 right-2 h-0.5 bg-accent rounded', dropMarker === 'before' ? 'top-0' : 'bottom-0'].join(' ')} />
      )}
    </button>
  )
}

function Divider({ dense }: { dense: boolean }) {
  return <div className={['w-full h-px bg-border shrink-0', dense ? 'my-0.5' : 'my-1'].join(' ')} />
}

function ItemGroups({ groups, side, showAccent, dense, wide, onReorder }: { groups: ActivityBarItem[][]; side: 'left' | 'right'; showAccent: boolean; dense: boolean; wide: boolean; onReorder?: ReorderHandler }) {
  const [dragging, setDragging] = React.useState<string | null>(null)
  const [drop, setDrop] = React.useState<{ id: string; placement: DropPlacement } | null>(null)
  const clear = () => { setDragging(null); setDrop(null) }

  const dragPropsFor = (item: ActivityBarItem) => {
    const id = item.dragId
    if (!id || !onReorder || item.disabled) return undefined
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent<HTMLButtonElement>) => {
        e.dataTransfer.setData(DRAG_MIME, id)
        e.dataTransfer.effectAllowed = 'move'
        setDragging(id)
      },
      onDragOver: (e: React.DragEvent<HTMLButtonElement>) => {
        if (!dragging || dragging === id) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDrop({ id, placement: placementFor(e) })
      },
      onDragLeave: () => setDrop((d) => (d?.id === id ? null : d)),
      onDrop: (e: React.DragEvent<HTMLButtonElement>) => {
        e.preventDefault()
        const from = e.dataTransfer.getData(DRAG_MIME) || dragging
        if (from && from !== id) onReorder(from, id, placementFor(e))
        clear()
      },
      onDragEnd: clear,
    }
  }

  return (
    <>
      {groups.map((group, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Divider dense={dense} />}
          {group.map((item) => (
            <ActivityBarButton
              key={item.id}
              item={item}
              showAccent={showAccent}
              side={side}
              dense={dense}
              wide={wide}
              dragProps={dragPropsFor(item)}
              dropMarker={drop && item.dragId && drop.id === item.dragId ? drop.placement : undefined}
            />
          ))}
        </React.Fragment>
      ))}
    </>
  )
}

export function ActivityBar({ side, groups, bottomGroups, showAccent = true, dense = false, wide = false, expandOnHover = false, edgeToggle, onReorder }: ActivityBarProps) {
  const [hovered, setHovered] = React.useState(false)
  // An inline rename only renders in the wide bar, so keep it open while one
  // is in progress even if the pointer leaves.
  const renaming = [...groups, ...(bottomGroups ?? [])].some((group) => group.some((item) => item.rename))
  const showWide = wide || (expandOnHover && (hovered || renaming))
  const bar = (
    <div
      className={[
        'relative flex flex-col shrink-0 bg-sidebar py-1',
        showWide ? 'w-40 items-stretch' : 'w-12 items-center',
        side === 'left' ? 'border-r border-border' : 'border-l border-border',
        expandOnHover ? 'h-full' : '',
        expandOnHover && showWide ? 'shadow-lg shadow-black/40' : '',
      ].join(' ')}
    >
      {edgeToggle && <EdgeGrip side={side} toggle={edgeToggle} />}
      <ItemGroups groups={groups} side={side} showAccent={showAccent} dense={dense} wide={showWide} onReorder={onReorder} />
      {bottomGroups && (
        <div className={['flex flex-col mt-auto', showWide ? 'items-stretch' : 'items-center'].join(' ')}>
          <ItemGroups groups={bottomGroups} side={side} showAccent={showAccent} dense={dense} wide={showWide} />
        </div>
      )}
    </div>
  )
  if (!expandOnHover) return bar
  // Hover mode reserves only the icon column; the widened bar floats over the
  // neighbouring panel instead of resizing it (which would reflow the terminal).
  return (
    <div
      className="relative w-12 shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={['absolute inset-y-0 z-40 flex', side === 'left' ? 'left-0' : 'right-0'].join(' ')}>
        {bar}
      </div>
    </div>
  )
}

export function FilesIcon() {
  return (
    <svg width="1.5rem" height="1.5rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 5C3 3.9 3.9 3 5 3H10.17C10.7 3 11.21 3.21 11.59 3.59L12.41 4.41C12.79 4.79 13.3 5 13.83 5H19C20.1 5 21 5.9 21 7V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 9H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function SearchIcon() {
  return (
    <svg width="1.5rem" height="1.5rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M15.5 15.5L20.5 20.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function ClaudeIcon({ color = '#D97757' }: { color?: string } = {}) {
  return (
    <svg width="1.375rem" height="1.375rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        clipRule="evenodd"
        fillRule="evenodd"
        d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z"
        fill={color}
      />
    </svg>
  )
}

export function BridgeIcon({ color = '#D97757' }: { color?: string } = {}) {
  return (
    <svg width="1.125rem" height="1.125rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="2" width="14.14" height="14.14" rx="2" transform="rotate(45 12 2)" fill={color} />
    </svg>
  )
}

export function NewSessionIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 3H6C4.9 3 4 3.9 4 5V19C4 20.1 4.9 21 6 21H18C19.1 21 20 20.1 20 19V9L14 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 3V9H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 12V17M9.5 14.5H14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// A plain plus, distinct from NewSessionIcon's file-with-corner-fold glyph —
// used for Claude's New Session button now that it sits directly under the
// Claude icon rather than grouped with Previous/Resume Session at the bottom.
export function NewSessionPlusIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// A pencil — the conventional "rename" glyph.
export function RenameIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 20H8L18.5 9.5C19.3 8.7 19.3 7.3 18.5 6.5L17.5 5.5C16.7 4.7 15.3 4.7 14.5 5.5L4 16V20Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13 7L17 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function PreviousSessionIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 12a9 9 0 1 0 3-6.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 4v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// A bulleted list, distinct from PreviousSessionIcon's circular-history-arrow —
// this one opens a list to pick from, rather than just stepping back one.
export function ResumeSessionIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="4" cy="6" r="1" fill="currentColor"/>
      <circle cx="4" cy="12" r="1" fill="currentColor"/>
      <circle cx="4" cy="18" r="1" fill="currentColor"/>
      <path d="M9 6H21M9 12H21M9 18H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// A hydraulic press — a ram descending onto a squashed-flat stack — reads
// as "compact" more directly than the earlier converging-chevrons glyph,
// which tested as ambiguous at toolbar size.
export function CompactIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M6 10H18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 17H19M5 21H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function ClearIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 20H9L3.5 14.5C2.7 13.7 2.7 12.3 3.5 11.5L13 2L21.5 10.5L13.5 18.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8.5 6.5L17 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function UsageIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 20V12M12 20V4M20 20V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function CostIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3V21M16.5 6.5C16.5 5 14.9 4 12 4C9 4 7 5.2 7 7.2C7 11.2 17 9.5 17 14C17 16.3 14.8 17.5 12 17.5C9.2 17.5 7 16.5 7 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function UsageGraphIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 16l5-6 4 4 7-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function GitIcon({ className }: { className?: string } = {}) {
  return (
    <svg className={className} width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="5" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="15" cy="12" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="9" cy="19" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9 7v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M10.4 6.2C12 8 13.5 9.5 13 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function DockerIcon({ className }: { className?: string } = {}) {
  return (
    <svg className={className} width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M12.5 5.5H10V3h2.5v2.5ZM10 9h2.5V6.5H10V9Zm-9 5.283c0 4.714 3.53 7.857 8.38 7.857 5.02 0 10.271 -3.976 10.271 -8.995 1.303 0.553 2.851 -0.156 3.349 -1.481 -0.498 -1.322 -1.48 -1.502 -2.781 -0.951 0.478 -2.392 -2.13 -2.654 -2.13 -2.654s-1.62 1.203 -0.185 3.116c0 0 -0.142 2.584 -2.238 2.584H1.524c-0.269 0 -0.535 0.256 -0.524 0.524ZM16 12.5h-2.5V10H16v2.5Zm-6 0h2.5V10H10v2.5Zm-1 0H6.5V10H9v2.5ZM6.5 9H9V6.5H6.5V9Zm-1 3.5H3V10h2.5v2.5Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

// A downward arrow into a tray — standard "download/update available" glyph,
// used for the vIDE-update notification row.
export function UpdateAvailableIcon({ className }: { className?: string } = {}) {
  return (
    <svg className={className} width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3v12M8 11l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function BellIcon({ className }: { className?: string } = {}) {
  return (
    <svg className={className} width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6 10a6 6 0 1 1 12 0c0 3.5 1 5 2 6H4c1-1 2-2.5 2-6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// "Abc" reads instantly as "text suggestions" — the previous cursor+arc
// design was too abstract for people to place at a glance. Rendered as real
// text (not drawn inside a scaled-down SVG viewBox, which was shrinking it
// to an illegible ~7px against the text-xs siblings elsewhere in the
// footer) so it matches their size and weight exactly. The dashed
// underline doubles as the predictive-text motif (an underlined suggestion)
// and keeps the existing marching-ants busy animation (same CSS class/
// keyframe as before, just moved from the old arc onto this underline).
// Paused (crossedOut) overlays a diagonal slash sized to the icon's actual
// box (not a fixed viewBox), so it stays corner-to-corner regardless of how
// "Abc" happens to measure — color is left as inherited currentColor (the
// button's own dim/hover treatment already carries that signal).
export function AutocompleteIcon({ crossedOut, busy, className }: { crossedOut: boolean; busy?: boolean; className?: string }) {
  return (
    <span className={['relative inline-flex flex-col items-center leading-none', className].filter(Boolean).join(' ')}>

      <span className="font-mono font-bold text-xs">Abc</span>
      <svg width="22" height="4" viewBox="0 0 22 4" className="mt-0.5" aria-hidden="true">
        <path
          d="M1 2h20"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="1 3"
          className={busy ? 'autocomplete-busy-arc' : undefined}
        />
      </svg>
      {crossedOut && (
        <svg
          className="absolute inset-0"
          width="100%"
          height="100%"
          viewBox="0 0 22 20"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line x1="1" y1="1" x2="21" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
    </span>
  )
}

export function TodoIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function NotesIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 3h9l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M15 3v4a1 1 0 0 0 1 1h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function JiraIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M29.762 1.004h-14.443c0 0 0 0 0 0 0 3.599 2.918 6.517 6.517 6.517 0 0 0 0 0 0h2.66v2.571c0.003 3.591 2.91 6.502 6.498 6.512h0.001v-14.343c0-0.002 0-0.003 0-0.005 0-0.685-0.55-1.241-1.232-1.251h-0.001zM22.616 8.198h-14.443c0.001 3.599 2.918 6.516 6.517 6.516h2.66v2.572c0.003 3.598 2.919 6.513 6.517 6.516h0v-14.352c0-0.691-0.56-1.251-1.251-1.251v0zM15.464 15.391h-14.46c0.002 3.6 2.921 6.517 6.521 6.517 0.006 0 0.012 0 0.018-0h2.661v2.57c0 0 0 0 0 0 0 3.598 2.916 6.515 6.514 6.517h0v-14.348c0-0.694-0.562-1.256-1.256-1.256v0z" />
    </svg>
  )
}

export function TerminalIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 17l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 19h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function BrowserIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M3 12H21" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M12 3C14.5 5.5 15.8 8.6 15.8 12C15.8 15.4 14.5 18.5 12 21C9.5 18.5 8.2 15.4 8.2 12C8.2 8.6 9.5 5.5 12 3Z" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

export function SettingsIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function PhoneIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M10.5 5.5H13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="12" cy="18" r="1" fill="currentColor"/>
    </svg>
  )
}

export function EditorIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 6L3 12L8 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 6L21 12L16 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function DisplaySettingsIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9 20H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12 16V20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function GraphIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="18" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="12" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8.2 7.2L10.5 15.8M15.8 7.2L13.5 15.8M8.5 6H15.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// A llama's head: long face with a single ear and muzzle dots, drawn
// stroke-based like the other activity-bar glyphs.
export function LlamaIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 600 600" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M600 392L504.249 558L504.137 557.929C487.252 584.069 458.193 600 426.864 600H120L240 392H600Z" fill="currentColor"/>
      <path d="M240 392H0L199.602 46.0254C216.032 17.5463 246.411 3.25756e-05 279.29 0H466.154L240 392Z" fill="currentColor"/>
    </svg>
  )
}
