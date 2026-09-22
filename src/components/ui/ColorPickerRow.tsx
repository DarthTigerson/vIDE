import { useRef, useState } from 'react'
import { ColorPickerPopover } from './ColorPickerPopover'
import { isValidHex } from '@/lib/color'

// Swatch + editable hex field. Shared by the custom *theme* editor (chrome
// colours) and the Editor Colors Custom scheme (syntax token colours) —
// same interaction, two different sets of colours.
export function ColorPickerRow({ label, value, onChange }: {
  label: string
  value: string
  onChange: (hex: string) => void
}) {
  const [open, setOpen] = useState(false)
  const swatchRef = useRef<HTMLButtonElement>(null)
  const [draft, setDraft] = useState<string | null>(null)

  function commitHex(raw: string) {
    const cleaned = raw.startsWith('#') ? raw : `#${raw}`
    if (isValidHex(cleaned)) {
      onChange(cleaned.toLowerCase())
    }
    setDraft(null)
  }

  return (
    <div className="flex items-center gap-3 py-1.5">
      <button
        ref={swatchRef}
        type="button"
        className="w-6 h-6 rounded border border-border shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
        style={{ background: value }}
        onClick={() => setOpen((o) => !o)}
        title={`Pick ${label} colour`}
      />
      <span className="w-28 shrink-0 text-sm text-fg">{label}</span>
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
        className="text-xs font-mono text-fg-subtle bg-transparent border-none p-0 focus:outline-none w-24"
      />
      {open && (
        <ColorPickerPopover
          anchorRef={swatchRef}
          value={value}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
