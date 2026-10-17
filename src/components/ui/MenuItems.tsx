import { useState } from 'react'

// Rows for the right-click menus (To Do, Notes): a plain item, an item with a
// checkmark, a divider, and a hover-opened submenu.
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

export function MenuDivider() {
  return <div className="my-1 h-px bg-border" />
}

export function SubMenuButton({ label, children }: { label: string; children: React.ReactNode }) {
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
        <div className="absolute left-full top-0 z-10 w-40 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50">
          {children}
        </div>
      )}
    </div>
  )
}
