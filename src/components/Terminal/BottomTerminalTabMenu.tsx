import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useBottomTerminalStore } from '@/stores/bottomTerminalStore'
import { MenuButton, MenuDivider } from '@/components/Editor/TabContextMenu'
import { ScriptsSubmenu } from '@/components/Scripts/ScriptsSubmenu'
import { runScriptInTerminal } from '@/lib/runScript'
import { clearLiveTerminal } from '@/lib/liveTerminals'
import { clampToViewport } from '@/components/ui/clampToViewport'
import { useCoverNativeViews } from '@/lib/nativeViewCover'

// Right-click menu for a bottom terminal tab: the editor tab menu's closing
// rows, plus moving the tab between sides and the terminal's own actions.
export function BottomTerminalTabMenu({ x, y, id, onClose }: { x: number; y: number; id: string; onClose: () => void }) {
  useCoverNativeViews()
  const menuRef = useRef<HTMLDivElement>(null)
  const sides = useBottomTerminalStore((s) => s.sides)
  const side = sides.findIndex((ids) => ids.includes(id))
  const total = sides.reduce((n, ids) => n + ids.length, 0)
  const store = useBottomTerminalStore.getState

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

  const withClose = (fn: () => void) => () => {
    fn()
    onClose()
  }

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[200] w-48 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuButton onClick={withClose(() => store().closeTerminal(id))}>Close</MenuButton>
      <MenuButton disabled={total < 2} onClick={withClose(() => store().closeOthers(id))}>Close Others</MenuButton>
      <MenuButton onClick={withClose(() => store().closeAll())}>Close All</MenuButton>
      <MenuDivider />
      {sides.length === 1 ? (
        <>
          <MenuButton disabled={total < 2} onClick={withClose(() => store().splitWith(id, 'after'))}>Split Right</MenuButton>
          <MenuButton disabled={total < 2} onClick={withClose(() => store().splitWith(id, 'before'))}>Split Left</MenuButton>
        </>
      ) : (
        <MenuButton onClick={withClose(() => store().moveTerminal(id, side === 0 ? 1 : 0, null))}>
          {side === 0 ? 'Move to Right Side' : 'Move to Left Side'}
        </MenuButton>
      )}
      <MenuDivider />
      <MenuButton onClick={withClose(() => clearLiveTerminal(id))}>Clear Terminal</MenuButton>
      <ScriptsSubmenu onPick={(script) => withClose(() => runScriptInTerminal(script, id))()} />
    </div>,
    document.body
  )
}
