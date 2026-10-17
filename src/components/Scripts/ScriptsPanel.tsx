import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Script } from '@/types/api'
import { useScriptsStore } from '@/stores/scriptsStore'
import { useEditorStore } from '@/stores/editorStore'
import { useFileStore } from '@/stores/fileStore'
import { orderScriptsForProject } from '@/lib/scriptOrder'
import { scriptDisplayTitle } from '@/lib/scriptBody'
import { runScriptInNewTerminal } from '@/lib/runScript'
import { buildScriptPath } from '@/components/Settings/paths'
import { MenuButton, MenuDivider } from '@/components/ui/MenuItems'
import { ConfirmTrashModal } from '@/components/ui/ConfirmTrashModal'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { useCoverNativeViews } from '@/lib/nativeViewCover'
import { NewScriptModal } from './NewScriptModal'

function openScript(id: string) {
  useEditorStore.getState().openTab({ path: buildScriptPath(id), content: '', dirty: false })
}

function RowMenu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: React.ReactNode }) {
  useCoverNativeViews()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = () => onClose()
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('click', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  useLayoutEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const clamped = clampToViewport(x, y, rect.width, rect.height)
    menuRef.current.style.left = `${clamped.x}px`
    menuRef.current.style.top = `${clamped.y}px`
  }, [x, y])

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[200] w-40 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  )
}

// The Scripts app: saved shell routines, the current project's first (a
// script is tagged with a project the first time it runs there).
export function ScriptsPanel() {
  const scripts = useScriptsStore((s) => s.scripts)
  const tags = useScriptsStore((s) => s.tags)
  const projectRoot = useFileStore((s) => s.projectRoot)
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; script: Script } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Script | null>(null)
  const [creating, setCreating] = useState(false)

  const q = query.trim().toLowerCase()
  const visible = q
    ? scripts.filter((s) => `${scriptDisplayTitle(s)}\n${s.description}`.toLowerCase().includes(q))
    : scripts
  const { tagged, others } = orderScriptsForProject(visible, tags, projectRoot)

  async function duplicate(script: Script) {
    const copy = await useScriptsStore.getState().create({
      title: `${scriptDisplayTitle(script)} copy`,
      description: script.description,
      body: script.body,
      shareOutput: script.shareOutput,
    })
    openScript(copy.id)
  }

  function commitRename(script: Script, value: string) {
    setRenamingId(null)
    const title = value.trim()
    if (title && title !== script.title) void useScriptsStore.getState().update(script.id, { title })
  }

  const row = (script: Script) => (
    <div
      key={script.id}
      className="group pr-2 flex items-start hover:bg-white/5 transition-colors"
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY, script })
      }}
    >
      {renamingId === script.id ? (
        <input
          autoFocus
          defaultValue={script.title}
          aria-label="Script name"
          onBlur={(e) => commitRename(script, e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename(script, e.currentTarget.value)
            if (e.key === 'Escape') setRenamingId(null)
          }}
          className="m-1 ml-2 flex-1 min-w-0 h-6 rounded border border-border bg-bg px-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent/70"
        />
      ) : (
        <button
          type="button"
          onClick={() => openScript(script.id)}
          className="flex-1 min-w-0 py-1.5 pl-3 text-left"
        >
          <span data-testid="script-row-title" className="block truncate text-sm text-fg-muted group-hover:text-fg">
            {scriptDisplayTitle(script)}
          </span>
          {script.description && (
            <span className="block truncate text-xs text-fg-subtle">{script.description}</span>
          )}
        </button>
      )}
      <button
        type="button"
        aria-label={`Run ${scriptDisplayTitle(script)}`}
        title="Run in a new terminal"
        onClick={() => runScriptInNewTerminal(script)}
        className="mt-1.5 w-5 h-5 shrink-0 flex items-center justify-center rounded text-fg-subtle opacity-0 group-hover:opacity-100 hover:text-fg hover:bg-white/10"
      >
        ▶
      </button>
    </div>
  )

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-border overflow-hidden">
      <div className="h-9 px-3 border-b border-border shrink-0 flex items-center justify-between">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Scripts</span>
        <button
          type="button"
          aria-label="New script"
          title="New script"
          onClick={() => setCreating(true)}
          className="w-5 h-5 flex items-center justify-center rounded text-fg-subtle hover:text-fg hover:bg-white/10"
        >
          +
        </button>
      </div>
      <div className="px-3 py-2 border-b border-border shrink-0">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search scripts"
          aria-label="Search scripts"
          className="w-full h-7 rounded border border-border bg-bg px-2 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-accent/70"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {scripts.length === 0 && (
          <p className="px-3 py-2 text-xs text-fg-subtle">
            No scripts yet. Use + to save a routine you run often, then run it from here or by right-clicking a terminal.
          </p>
        )}
        {tagged.map(row)}
        {tagged.length > 0 && others.length > 0 && <div className="mx-3 my-1 h-px bg-border" />}
        {others.map(row)}
      </div>

      {menu && (
        <RowMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <MenuButton onClick={() => { runScriptInNewTerminal(menu.script); setMenu(null) }}>Run</MenuButton>
          <MenuButton onClick={() => { setRenamingId(menu.script.id); setMenu(null) }}>Rename</MenuButton>
          <MenuButton onClick={() => { void duplicate(menu.script); setMenu(null) }}>Duplicate</MenuButton>
          <MenuDivider />
          <MenuButton danger onClick={() => { setConfirmDelete(menu.script); setMenu(null) }}>Delete</MenuButton>
        </RowMenu>
      )}
      {creating && <NewScriptModal onClose={() => setCreating(false)} onCreated={openScript} />}
      {confirmDelete && (
        <ConfirmTrashModal
          name={scriptDisplayTitle(confirmDelete)}
          title="Delete Script"
          verb="Permanently delete"
          suffix="from every synced machine?"
          confirmLabel="Delete Script"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            void useScriptsStore.getState().remove(confirmDelete.id)
            setConfirmDelete(null)
          }}
        />
      )}
    </div>
  )
}
