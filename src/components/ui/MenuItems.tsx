import { useState } from 'react'

// Rows for the right-click menus (To Do, Notes, Site Tree): a plain item, an
// item with a checkmark, an item with an on/off switch, a group heading, a
// divider, and a hover-opened submenu.
export function MenuButton({
  children,
  danger = false,
  onClick,
}: {
  children: React.ReactNode
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full rounded px-2 py-1.5 text-left text-xs transition-colors',
        danger
          ? 'text-red-300 hover:bg-red-500/15 hover:text-red-200'
          : 'text-fg-muted hover:bg-white/5 hover:text-fg',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function CheckableMenuButton({
  checked,
  onClick,
  children,
}: {
  checked: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <MenuButton onClick={onClick}>
      <span className="flex items-center justify-between">
        {children}
        {checked && <span className="text-accent">✓</span>}
      </span>
    </MenuButton>
  )
}

// An on/off setting inside a menu: a small version of the Settings Switch.
// The caller keeps the menu open on click, so several can be flipped in a row.
export function SwitchMenuButton({
  checked,
  onClick,
  children,
}: {
  checked: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
    >
      {children}
      <span
        aria-hidden="true"
        className={[
          'relative shrink-0 w-[1.625rem] h-3.5 rounded-full border transition-colors',
          checked ? 'bg-accent border-accent/80' : 'bg-white/10 border-white/15',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-px left-px w-2.5 h-2.5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-3' : 'translate-x-0',
          ].join(' ')}
        />
      </span>
    </button>
  )
}

export function MenuHeading({ children }: { children: React.ReactNode }) {
  return <div className="px-2 pt-1.5 pb-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-fg-subtle">{children}</div>
}

export function MenuDivider() {
  return <div className="my-1 h-px bg-border" />
}

export function SubMenuButton({ label, width = 'w-40', children }: {
  label: string
  // Tailwind width class for the submenu panel.
  width?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
      >
        {label}
        <span className="text-fg-subtle">▸</span>
      </button>
      {open && (
        <div className={`absolute left-full top-0 z-10 ${width} rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50`}>
          {children}
        </div>
      )}
    </div>
  )
}
