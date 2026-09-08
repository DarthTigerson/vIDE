import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { clampToViewport } from './clampToViewport'
import { hexToHsv, hsvToHex, isValidHex } from '@/lib/color'
import { getRecentColors, addRecentColor } from '@/lib/recentColors'

export function ColorPickerPopover({ anchorRef, value, onChange, onClose }: {
  anchorRef: React.RefObject<HTMLElement>
  value: string
  onChange: (hex: string) => void
  onClose: () => void
}) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState({ left: 0, top: 0 })
  const [recents, setRecents] = useState<string[]>(() => getRecentColors())
  const [draft, setDraft] = useState<string | null>(null)
  const [draggingSV, setDraggingSV] = useState(false)
  const [draggingHue, setDraggingHue] = useState(false)

  const { h, s, v } = hexToHsv(value)

  useLayoutEffect(() => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const popoverHeight = popoverRef.current?.getBoundingClientRect().height ?? 260
    const clamped = clampToViewport(rect.left, rect.bottom + 4, 208, popoverHeight)
    setStyle({ left: clamped.x, top: clamped.y })
  }, [anchorRef])

  useEffect(() => {
    const closeOnOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (popoverRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    const closeOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', closeOnOutsideClick)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('mousedown', closeOnOutsideClick)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [anchorRef, onClose])

  function remember(hex: string) {
    setRecents(addRecentColor(hex))
  }

  useEffect(() => {
    if (!draggingSV) return
    const fromEvent = (e: PointerEvent) => {
      const rect = svRef.current!.getBoundingClientRect()
      const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
      const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
      return hsvToHex(h, x, 1 - y)
    }
    const move = (e: PointerEvent) => onChange(fromEvent(e))
    const up = (e: PointerEvent) => { remember(fromEvent(e)); setDraggingSV(false) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [draggingSV, h])

  useEffect(() => {
    if (!draggingHue) return
    const fromEvent = (e: PointerEvent) => {
      const rect = hueRef.current!.getBoundingClientRect()
      const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
      return hsvToHex(x * 360, s, v)
    }
    const move = (e: PointerEvent) => onChange(fromEvent(e))
    const up = (e: PointerEvent) => { remember(fromEvent(e)); setDraggingHue(false) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [draggingHue, s, v])

  function commitHex(raw: string) {
    const cleaned = raw.startsWith('#') ? raw : `#${raw}`
    if (isValidHex(cleaned)) {
      const lower = cleaned.toLowerCase()
      onChange(lower)
      remember(lower)
    }
    setDraft(null)
  }

  const hueBackground = 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'

  return createPortal(
    <div
      ref={popoverRef}
      style={{ position: 'fixed', left: style.left, top: style.top, width: 208 }}
      className="z-30 p-3 rounded-lg border border-border bg-popover shadow-lg shadow-black/40 flex flex-col gap-3"
    >
      <div
        ref={svRef}
        data-testid="sv-square"
        onPointerDown={(e) => {
          setDraggingSV(true)
          const rect = e.currentTarget.getBoundingClientRect()
          const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
          const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
          onChange(hsvToHex(h, x, 1 - y))
        }}
        className="relative w-full h-32 rounded cursor-crosshair"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${hsvToHex(h, 1, 1)}`,
        }}
      >
        <div
          className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full border-2 border-white shadow"
          style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}
        />
      </div>

      <div
        ref={hueRef}
        data-testid="hue-slider"
        onPointerDown={(e) => {
          setDraggingHue(true)
          const rect = e.currentTarget.getBoundingClientRect()
          const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
          onChange(hsvToHex(x * 360, s, v))
        }}
        className="relative w-full h-4 rounded cursor-pointer"
        style={{ background: hueBackground }}
      >
        <div
          className="absolute top-0 bottom-0 w-1 -ml-0.5 rounded bg-white shadow border border-black/30"
          style={{ left: `${(h / 360) * 100}%` }}
        />
      </div>

      {recents.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recents.map((hex) => (
            <button
              key={hex}
              type="button"
              title={hex}
              onClick={() => onChange(hex)}
              className="w-5 h-5 rounded border border-border shrink-0 hover:opacity-80 transition-opacity"
              style={{ background: hex }}
            />
          ))}
        </div>
      )}

      <input
        type="text"
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commitHex(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setDraft(null)
        }}
        spellCheck={false}
        className="w-full h-7 px-2 text-xs font-mono text-fg bg-bg border border-border rounded focus:outline-none focus:border-accent/60"
      />
    </div>,
    document.body,
  )
}
