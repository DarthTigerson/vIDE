import { useState } from 'react'
import type { Script } from '@/types/api'
import { useScriptsStore } from '@/stores/scriptsStore'
import { useScriptsSettingsStore } from '@/stores/scriptsSettingsStore'
import { useFileStore } from '@/stores/fileStore'
import { orderScriptsForProject } from '@/lib/scriptOrder'
import { scriptDisplayTitle } from '@/lib/scriptBody'

const rowClass =
  'block w-full truncate rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg'

// "Scripts ▸" row for the terminal menus (tab strip and inside the
// terminal): the current project's scripts, a divider, then the rest.
// `opens` picks the side the list flies out to (away from a right-docked
// bar); `triggerClassName`/`icon` let a host menu style the row like its own.
export function ScriptsSubmenu({ onPick, opens = 'right', triggerClassName, icon }: {
  onPick: (script: Script) => void
  opens?: 'left' | 'right'
  triggerClassName?: string
  icon?: React.ReactNode
}) {
  const enabled = useScriptsSettingsStore((s) => s.enabled)
  const scripts = useScriptsStore((s) => s.scripts)
  const tags = useScriptsStore((s) => s.tags)
  const projectRoot = useFileStore((s) => s.projectRoot)
  const [open, setOpen] = useState(false)
  if (!enabled) return null

  const { tagged, others } = orderScriptsForProject(scripts, tags, projectRoot)
  const row = (script: Script) => (
    <button key={script.id} type="button" title={script.description || undefined} className={rowClass} onClick={() => onPick(script)}>
      {scriptDisplayTitle(script)}
    </button>
  )

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label="Scripts"
        className={triggerClassName ?? 'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg'}
      >
        {icon}
        <span className={icon ? 'flex-1 truncate' : undefined}>Scripts</span>
        <span className="text-fg-subtle">{opens === 'left' ? '◂' : '▸'}</span>
      </button>
      {open && (
        <div className={`absolute ${opens === 'left' ? 'right-full' : 'left-full'} top-0 z-10 max-h-80 w-56 overflow-y-auto rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50`}>
          {scripts.length === 0 && <div className="px-2 py-1.5 text-xs text-fg-subtle">No scripts yet</div>}
          {tagged.map(row)}
          {tagged.length > 0 && others.length > 0 && <div className="my-1 h-px bg-border" />}
          {others.map(row)}
        </div>
      )}
    </div>
  )
}
