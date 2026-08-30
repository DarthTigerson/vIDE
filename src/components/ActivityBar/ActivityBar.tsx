import React from 'react'

export interface ActivityBarItem {
  id: string
  icon: React.ReactNode
  title: string
  active: boolean
  badge?: string | number
  disabled?: boolean
  onClick: () => void
}

interface ActivityBarProps {
  side: 'left' | 'right'
  groups: ActivityBarItem[][]
  bottomGroups?: ActivityBarItem[][]
  showAccent?: boolean
  dense?: boolean
}

function ActivityBarButton({ item, showAccent, side, dense }: { item: ActivityBarItem; showAccent: boolean; side: 'left' | 'right'; dense: boolean }) {
  return (
    <button
      key={item.id}
      onClick={item.disabled ? undefined : item.onClick}
      aria-label={item.title}
      disabled={item.disabled}
      className={[
        'relative flex items-center justify-center w-12 transition-colors group disabled:cursor-not-allowed',
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
          item.disabled
            ? 'text-fg-subtle opacity-30'
            : item.active
              ? 'text-fg opacity-100'
              : 'text-fg-muted opacity-50 group-hover:opacity-100 group-hover:text-accent',
        ].join(' ')}
      >
        {item.icon}
      </span>
      {item.badge !== undefined && item.badge !== null && item.badge !== '' && (
        <span className="absolute right-1 bottom-1 min-w-4 h-4 rounded-full bg-accent px-1 text-[0.5625rem] font-bold leading-4 text-on-accent shadow shadow-black/40">
          {item.badge}
        </span>
      )}
      <span
        className={[
          'pointer-events-none absolute z-50 top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-black/90 px-2 py-1 text-xs text-gray-200 opacity-0 transition-opacity duration-100 delay-150 group-hover:opacity-100',
          side === 'left' ? 'left-full ml-2' : 'right-full mr-2',
        ].join(' ')}
      >
        {item.title}
      </span>
    </button>
  )
}

function Divider({ dense }: { dense: boolean }) {
  return <div className={['w-full h-px bg-border shrink-0', dense ? 'my-0.5' : 'my-1'].join(' ')} />
}

function ItemGroups({ groups, side, showAccent, dense }: { groups: ActivityBarItem[][]; side: 'left' | 'right'; showAccent: boolean; dense: boolean }) {
  return (
    <>
      {groups.map((group, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Divider dense={dense} />}
          {group.map((item) => (
            <ActivityBarButton key={item.id} item={item} showAccent={showAccent} side={side} dense={dense} />
          ))}
        </React.Fragment>
      ))}
    </>
  )
}

export function ActivityBar({ side, groups, bottomGroups, showAccent = true, dense = false }: ActivityBarProps) {
  return (
    <div
      className={[
        'flex flex-col items-center w-12 shrink-0 bg-sidebar py-1',
        side === 'left' ? 'border-r border-border' : 'border-l border-border',
      ].join(' ')}
    >
      <ItemGroups groups={groups} side={side} showAccent={showAccent} dense={dense} />
      {bottomGroups && (
        <div className="flex flex-col items-center mt-auto">
          <ItemGroups groups={bottomGroups} side={side} showAccent={showAccent} dense={dense} />
        </div>
      )}
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

export function ClaudeIcon() {
  return (
    <svg width="1.375rem" height="1.375rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        clipRule="evenodd"
        fillRule="evenodd"
        d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z"
        fill="#D97757"
      />
    </svg>
  )
}

export function CodexIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 7L3 12L8 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 7L21 12L16 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 5L10 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M12 12H12.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
    </svg>
  )
}

export function BridgeIcon() {
  return (
    <svg width="1.125rem" height="1.125rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="2" width="14.14" height="14.14" rx="2" transform="rotate(45 12 2)" fill="#D97757" />
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

export function PreviousSessionIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 12a9 9 0 1 0 3-6.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 4v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function CompactIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 9L12 13L16 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4 15C6.5 17 17.5 17 20 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M4 18.3C6.5 19.6 17.5 19.6 20 18.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M4 21.5H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
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

export function UsageGraphIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 16l5-6 4 4 7-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function ModelIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3L19 7V15L12 21L5 15V7L12 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M12 3V11M19 7L12 11M5 7L12 11M12 21V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function FastIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 2L5 13H11L9 22L19 9H13L13 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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

export function DockerIcon() {
  return (
    <svg width="1.25rem" height="1.25rem" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="10" width="4" height="4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <rect x="8" y="10" width="4" height="4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <rect x="8" y="5" width="4" height="4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <rect x="13" y="10" width="4" height="4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M2 14c0 4 3.5 6.5 9 6.5S21 17 21.5 12c-1.2.8-2.4.6-3-.4-.8 1-2.4 1.3-3.2.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
