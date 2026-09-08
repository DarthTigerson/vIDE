import { useEffect, useRef, useState } from 'react'
import { useCustomThemeStore, CUSTOM_COLOR_VARS } from '@/stores/customThemeStore'
import { useThemeStore } from '@/stores/themeStore'
import { ColorPickerPopover } from '@/components/ui/ColorPickerPopover'
import { isValidHex } from '@/lib/color'

function ColorPickerRow({ label, value, onChange }: {
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

export function CustomThemeEditor({ themeId, onClose }: { themeId: string; onClose: () => void }) {
  const theme = useCustomThemeStore((s) => s.themes.find((t) => t.id === themeId))
  const rename = useCustomThemeStore((s) => s.rename)
  const setSwatch = useCustomThemeStore((s) => s.setSwatch)
  const copyVariant = useCustomThemeStore((s) => s.copyVariant)
  const deleteTheme = useCustomThemeStore((s) => s.deleteTheme)
  const exportTheme = useCustomThemeStore((s) => s.exportTheme)
  const liveVariant = useThemeStore((s) => (s.theme.endsWith('-dark') ? 'dark' : 'light'))
  const [variant, setVariant] = useState<'light' | 'dark'>(liveVariant)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!theme) onClose()
  }, [theme, onClose])

  if (!theme) return null

  function handleExport() {
    navigator.clipboard.writeText(exportTheme(themeId))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mt-4 p-4 rounded-lg border border-border bg-bg/40">
      <div className="flex items-center justify-between gap-3 mb-3">
        <input
          type="text"
          value={theme.name}
          onChange={(e) => rename(themeId, e.target.value)}
          spellCheck={false}
          className="text-sm font-medium text-fg bg-transparent border-b border-transparent hover:border-border focus:border-accent/60 focus:outline-none"
        />
        <button type="button" onClick={onClose} className="text-xs text-fg-subtle hover:text-fg">
          Close
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex gap-1">
          {(['light', 'dark'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVariant(v)}
              className={[
                'px-2.5 py-1 text-xs rounded-md capitalize transition-colors',
                variant === v ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:text-fg',
              ].join(' ')}
            >
              {v}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => copyVariant(themeId, variant === 'dark' ? 'light' : 'dark', variant)}
          className="text-xs font-medium text-accent hover:underline"
        >
          Copy from {variant === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>

      <div className="flex flex-col mb-4">
        {CUSTOM_COLOR_VARS.map((def) => (
          <ColorPickerRow
            key={def.varName}
            label={def.label}
            value={theme[variant][def.varName]}
            onChange={(hex) => setSwatch(themeId, variant, def.varName, hex)}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={handleExport} className="text-xs font-medium text-accent hover:underline">
          {copied ? 'Copied!' : 'Export'}
        </button>
        <button
          type="button"
          onClick={() => deleteTheme(themeId)}
          className="text-xs text-fg-subtle hover:text-red-400 transition-colors"
        >
          Delete theme
        </button>
      </div>
    </div>
  )
}
