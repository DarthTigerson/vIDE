import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useEditorStore, findAdjacentPane, type PaneDirection, type EditorSplitDirection, type SplitPlacement } from '@/stores/editorStore'
import { useBrowserStore } from '@/stores/browserStore'
import { useEditorSettingsStore } from '@/stores/editorSettingsStore'
import { isBrowserTab, getBrowserId, buildBrowserPath } from '@/components/Settings/paths'
import { clampToViewport } from '@/components/ui/clampToViewport'

const DIRECTIONS: { direction: PaneDirection; label: string }[] = [
  { direction: 'right', label: 'Right' },
  { direction: 'left', label: 'Left' },
  { direction: 'up', label: 'Up' },
  { direction: 'down', label: 'Down' },
]

const SPLIT_FOR_DIRECTION: Record<PaneDirection, { direction: EditorSplitDirection; placement: SplitPlacement }> = {
  right: { direction: 'horizontal', placement: 'after' },
  left: { direction: 'horizontal', placement: 'before' },
  down: { direction: 'vertical', placement: 'after' },
  up: { direction: 'vertical', placement: 'before' },
}

function copyToClipboard(text: string): void {
  navigator.clipboard?.writeText(text).catch(() => {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    textarea.remove()
  })
}

function MenuButton({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
    >
      {children}
    </button>
  )
}

function MenuDivider() {
  return <div className="my-1 h-px bg-border" />
}

function SubMenuButton({ label, disabled, items }: {
  label: string
  disabled?: boolean
  items: { id: string; label: string; onSelect: () => void }[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <div
      className="relative"
      onMouseEnter={() => !disabled && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-white/5 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
      >
        {label}
        <span className="text-fg-subtle">▸</span>
      </button>
      {open && !disabled && (
        <div className="absolute left-full top-0 z-10 w-36 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50">
          {items.map((item) => (
            <MenuButton key={item.id} onClick={item.onSelect}>
              {item.label}
            </MenuButton>
          ))}
        </div>
      )}
    </div>
  )
}

export function TabContextMenu({ x, y, paneId, path, onClose }: {
  x: number
  y: number
  paneId: string
  path: string
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  const {
    closeTabInPane, closeAllTabs, closeSavedTabs, togglePin, splitPaneForTab, moveTabToAdjacentPane,
    pinnedPaths, layout, paneTabLists,
  } = useEditorStore()
  const autoSaveEnabled = useEditorSettingsStore((s) => s.autoSaveEnabled)
  const fullscreenId = useBrowserStore((s) => s.fullscreenId)

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

  const isBrowser = isBrowserTab(path)
  const isPinned = pinnedPaths.has(path)
  const paneList = paneTabLists[paneId] ?? []
  const canSplit = paneList.length >= 2

  const moveDirections = DIRECTIONS.filter(
    ({ direction }) => findAdjacentPane(layout, paneId, direction) !== null
  )

  function withClose(fn: () => void) {
    return () => {
      fn()
      onClose()
    }
  }

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[200] w-48 rounded border border-border bg-popover p-1 shadow-2xl shadow-black/50"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {isBrowser && (
        <>
          <MenuButton onClick={withClose(() => window.api.browserViewReload(getBrowserId(path)))}>
            Reload
          </MenuButton>
          <MenuButton
            onClick={withClose(() => {
              const currentUrl = useBrowserStore.getState().tabs[getBrowserId(path)]?.url ?? ''
              const newId = Date.now().toString(36)
              useBrowserStore.getState().ensureTab(newId, currentUrl)
              useEditorStore.getState().openTab({ path: buildBrowserPath(newId), content: '', dirty: false })
            })}
          >
            Duplicate
          </MenuButton>
          <MenuButton onClick={withClose(() => useBrowserStore.getState().toggleFullscreen(getBrowserId(path)))}>
            {fullscreenId === getBrowserId(path) ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          </MenuButton>
          <MenuDivider />
        </>
      )}

      <MenuButton onClick={withClose(() => closeTabInPane(paneId, path))}>Close</MenuButton>
      <MenuButton onClick={withClose(closeAllTabs)}>Close All</MenuButton>
      {!autoSaveEnabled && (
        <MenuButton onClick={withClose(closeSavedTabs)}>Close All Saved</MenuButton>
      )}
      <MenuDivider />

      <MenuButton onClick={withClose(() => togglePin(path))}>
        {isPinned ? 'Unpin Tab' : 'Pin Tab'}
      </MenuButton>
      <MenuDivider />

      <SubMenuButton
        label="Split"
        disabled={!canSplit}
        items={DIRECTIONS.map(({ direction, label }) => ({
          id: direction,
          label,
          onSelect: withClose(() => {
            const { direction: splitDirection, placement } = SPLIT_FOR_DIRECTION[direction]
            splitPaneForTab(paneId, path, splitDirection, placement)
          }),
        }))}
      />
      {moveDirections.length > 0 && (
        <SubMenuButton
          label="Move"
          items={moveDirections.map(({ direction, label }) => ({
            id: direction,
            label,
            onSelect: withClose(() => moveTabToAdjacentPane(paneId, path, direction)),
          }))}
        />
      )}

      {!isBrowser && (
        <>
          <MenuDivider />
          <MenuButton onClick={withClose(() => copyToClipboard(path))}>Copy File Path</MenuButton>
        </>
      )}
    </div>,
    document.body
  )
}
