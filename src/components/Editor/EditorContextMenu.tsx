import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type * as Monaco from 'monaco-editor'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { isMac } from '@/lib/platform'
import { ShortcutKeys } from '@/components/ui/ShortcutKeys'
import { useCoverNativeViews } from '@/lib/nativeViewCover'

const CHANGE_ALL_HINT = isMac ? '⌘F2' : 'Ctrl+F2'

function MenuButton({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-4 rounded-sm px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
    >
      <span>{label}</span>
      {hint && <ShortcutKeys shortcut={hint} />}
    </button>
  )
}

function MenuDivider() {
  return <div className="my-1 h-px bg-border" />
}

interface Props {
  x: number
  y: number
  editor: Monaco.editor.IStandaloneCodeEditor
  onClose: () => void
}

// Replaces Monaco's own native right-click menu (disabled via the
// `contextmenu: false` editor option) with one matching the rest of the
// app's context menus (TabContextMenu, CommitContextMenu, etc.) - same
// createPortal-to-document.body + clampToViewport pattern. Built because
// Monaco has no public API to remove a single built-in menu entry (only
// `MenuRegistry.appendMenuItem`, no matching remove) without reaching into
// undocumented internals, and owning the menu ourselves makes future
// changes here a normal React change instead of another internals dig.
export function EditorContextMenu({ x, y, editor, onClose }: Props) {
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

  function run(actionId: string) {
    return () => {
      editor.getAction(actionId)?.run()
      onClose()
    }
  }

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[200] w-56 rounded-sm border border-border bg-popover p-1 shadow-2xl shadow-black/50"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuButton
        label="Change All Occurrences"
        hint={CHANGE_ALL_HINT}
        onClick={run('editor.action.changeAll')}
      />
      <MenuDivider />

      <MenuButton label="Cut" onClick={run('editor.action.clipboardCutAction')} />
      <MenuButton label="Copy" onClick={run('editor.action.clipboardCopyAction')} />
      <MenuButton label="Paste" onClick={run('editor.action.clipboardPasteAction')} />
    </div>,
    document.body
  )
}
