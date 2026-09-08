import { useState } from 'react'
import { useThemeStore, THEME_OPTIONS, familyOf } from '@/stores/themeStore'
import { useCustomThemeStore, type CustomTheme, type CustomColorVar } from '@/stores/customThemeStore'
import { RadioGroup } from '@/components/ui/RadioGroup'
import { Section } from './SettingsLayout'
import { CustomThemeEditor } from './CustomThemeEditor'
import { CustomThemeContextMenu } from './CustomThemeContextMenu'

const PREVIEW_VAR_ORDER: CustomColorVar[] = [
  '--color-bg', '--color-panel', '--color-sidebar', '--color-accent', '--color-border',
]

// One card per family in the picker (built-ins used to show a separate
// card per light/dark variant — now that variant is its own Light/System/
// Dark control below, that split is a duplicate, not a choice).
const FAMILIES = Array.from(new Set(THEME_OPTIONS.map((t) => familyOf(t.id))))

const VARIANT_OPTIONS: { value: 'light' | 'dark' | 'system'; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
]

function CustomThemeCard({ theme, isActive, variant, onActivate, onEdit, onShare, onDelete }: {
  theme: CustomTheme
  isActive: boolean
  variant: 'light' | 'dark'
  onActivate: () => void
  onEdit: () => void
  onShare: () => void
  onDelete: () => void
}) {
  const swatches = PREVIEW_VAR_ORDER.map((v) => theme[variant][v])
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  return (
    <button
      type="button"
      onClick={onActivate}
      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }}
      className={[
        'text-left rounded-lg border-2 p-3 transition-colors',
        isActive ? 'border-accent' : 'border-border hover:border-fg-muted',
      ].join(' ')}
    >
      <div className="flex gap-1 mb-3 rounded overflow-hidden h-10">
        {swatches.map((color, i) => <div key={i} className="flex-1" style={{ background: color }} />)}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-fg truncate">{theme.name}</span>
        {isActive && (
          <span className="shrink-0 text-xs font-medium text-accent px-1.5 py-0.5 rounded bg-accent/10">Active</span>
        )}
      </div>
      {menu && (
        <CustomThemeContextMenu
          x={menu.x}
          y={menu.y}
          onEdit={onEdit}
          onShare={onShare}
          onDelete={onDelete}
          onClose={() => setMenu(null)}
        />
      )}
    </button>
  )
}

function NewThemeCard({ onCreate }: { onCreate: () => void }) {
  return (
    <button
      type="button"
      onClick={onCreate}
      className="rounded-lg border-2 border-dashed border-border hover:border-fg-muted p-3 flex flex-col items-center justify-center gap-1 text-fg-subtle hover:text-fg transition-colors"
    >
      <span className="text-xl leading-none">+</span>
      <span className="text-xs font-medium">New Custom Theme</span>
    </button>
  )
}

function ImportThemeCard({ onImport }: { onImport: (json: string) => string | null }) {
  const [importing, setImporting] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const err = onImport(text)
    if (err) { setError(err); return }
    setImporting(false)
    setText('')
    setError(null)
  }

  if (!importing) {
    return (
      <button
        type="button"
        onClick={() => setImporting(true)}
        className="rounded-lg border-2 border-dashed border-border hover:border-fg-muted p-3 flex flex-col items-center justify-center gap-1 text-fg-subtle hover:text-fg transition-colors"
      >
        <span className="text-xl leading-none">+</span>
        <span className="text-xs font-medium">Import Theme</span>
      </button>
    )
  }

  return (
    <div className="col-span-full flex flex-col gap-2 rounded-lg border border-border p-3">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste exported theme JSON here"
        spellCheck={false}
        rows={4}
        className="w-full px-2 py-1.5 text-xs font-mono text-fg bg-bg border border-border rounded focus:outline-none focus:border-accent/60"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={submit} className="text-xs font-medium text-accent hover:underline">
          Add theme
        </button>
        <button
          type="button"
          onClick={() => { setImporting(false); setText(''); setError(null) }}
          className="text-xs text-fg-subtle hover:text-fg"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export function ThemeSection() {
  const { theme, matchSystem, setMatchSystem, setFamily, setVariant } = useThemeStore()
  const customThemes = useCustomThemeStore((s) => s.themes)
  const activeCustomId = useCustomThemeStore((s) => s.activeId)
  const setActiveCustom = useCustomThemeStore((s) => s.setActive)
  const createFromActive = useCustomThemeStore((s) => s.createFromActive)
  const deleteTheme = useCustomThemeStore((s) => s.deleteTheme)
  const exportTheme = useCustomThemeStore((s) => s.exportTheme)
  const importTheme = useCustomThemeStore((s) => s.importTheme)
  const [editingId, setEditingId] = useState<string | null>(null)

  const variant: 'light' | 'dark' = theme.endsWith('-dark') ? 'dark' : 'light'
  const appearance: 'light' | 'dark' | 'system' = matchSystem ? 'system' : variant

  function activateBuiltIn(family: string) {
    setFamily(family)
    setActiveCustom(null)
    setEditingId(null)
  }

  function setAppearance(v: 'light' | 'dark' | 'system') {
    if (v === 'system') { setMatchSystem(true); return }
    setVariant(v === 'dark')
  }

  function activateCustom(id: string) {
    const target = customThemes.find((t) => t.id === id)
    if (!target) return
    setFamily(target.baseFamily)
    setActiveCustom(id)
  }

  function handleCreate() {
    const numbers = customThemes
      .map((t) => /^Custom Theme (\d+)$/.exec(t.name)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number)
    const next = numbers.length ? Math.max(...numbers) + 1 : 1
    setEditingId(createFromActive(`Custom Theme ${next}`))
  }

  function handleImport(json: string): string | null {
    const result = importTheme(json)
    return result.ok ? null : result.error
  }

  return (
    <Section label="Theme">
      <div className="pb-4 pl-3">
        <div className="mb-5">
          <span className="text-xs text-fg-muted mb-1.5 block">Appearance</span>
          <RadioGroup
            ariaLabel="Appearance"
            value={appearance}
            onChange={setAppearance}
            options={VARIANT_OPTIONS}
          />
        </div>
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
          {FAMILIES.map((family) => {
            const isActive = !activeCustomId && familyOf(theme) === family
            const option = THEME_OPTIONS.find((t) => t.id === `${family}-${variant}`)!
            const label = option.name.replace(/\s+(Light|Dark)$/, '')
            return (
              <button
                key={family}
                type="button"
                onClick={() => activateBuiltIn(family)}
                className={[
                  'text-left rounded-lg border-2 p-3 transition-colors',
                  isActive ? 'border-accent' : 'border-border hover:border-fg-muted',
                ].join(' ')}
              >
                <div className="flex gap-1 mb-3 rounded overflow-hidden h-10">
                  {option.swatches.map((color, i) => <div key={i} className="flex-1" style={{ background: color }} />)}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-fg truncate">{label}</span>
                  {isActive && (
                    <span className="shrink-0 text-xs font-medium text-accent px-1.5 py-0.5 rounded bg-accent/10">Active</span>
                  )}
                </div>
              </button>
            )
          })}

          <div className="col-span-full flex items-center gap-3 my-1" aria-hidden="true">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">Custom Themes</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {customThemes.map((t) => (
            <CustomThemeCard
              key={t.id}
              theme={t}
              variant={variant}
              isActive={activeCustomId === t.id}
              onActivate={() => activateCustom(t.id)}
              onEdit={() => { activateCustom(t.id); setEditingId(t.id) }}
              onShare={() => navigator.clipboard.writeText(exportTheme(t.id))}
              onDelete={() => deleteTheme(t.id)}
            />
          ))}

          <NewThemeCard onCreate={handleCreate} />
          <ImportThemeCard onImport={handleImport} />
        </div>

        {editingId && <CustomThemeEditor themeId={editingId} onClose={() => setEditingId(null)} />}
      </div>
    </Section>
  )
}
