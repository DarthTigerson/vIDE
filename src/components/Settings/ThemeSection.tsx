import { useState } from 'react'
import { useThemeStore, THEME_OPTIONS } from '@/stores/themeStore'
import { useCustomThemeStore, type CustomTheme, type CustomColorVar } from '@/stores/customThemeStore'
import { Toggle } from '@/components/ui/Toggle'
import { Section } from './SettingsLayout'
import { CustomThemeEditor } from './CustomThemeEditor'

const PREVIEW_VAR_ORDER: CustomColorVar[] = [
  '--color-bg', '--color-panel', '--color-sidebar', '--color-accent', '--color-border',
]

function EditIcon() {
  return (
    <svg className="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16.5 3.5L20.5 7.5L8 20H4V16L16.5 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 7H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 7V4.5C9 4.22386 9.22386 4 9.5 4H14.5C14.7761 4 15 4.22386 15 4.5V7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M6.5 7L7.2 19C7.24 19.55 7.7 20 8.25 20H15.75C16.3 20 16.76 19.55 16.8 19L17.5 7" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function CustomThemeCard({ theme, isActive, variant, onActivate, onEdit, onDelete }: {
  theme: CustomTheme
  isActive: boolean
  variant: 'light' | 'dark'
  onActivate: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const swatches = PREVIEW_VAR_ORDER.map((v) => theme[variant][v])
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(e) => { if (e.key === 'Enter') onActivate() }}
      className={[
        'group relative text-left rounded-lg border-2 p-3 transition-colors cursor-pointer',
        isActive ? 'border-accent' : 'border-border hover:border-fg-muted',
      ].join(' ')}
    >
      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          className="w-5 h-5 flex items-center justify-center rounded bg-panel/90 text-fg-subtle hover:text-fg"
          title={`Edit ${theme.name}`}
        >
          <EditIcon />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="w-5 h-5 flex items-center justify-center rounded bg-panel/90 text-fg-subtle hover:text-red-400"
          title={`Delete ${theme.name}`}
        >
          <TrashIcon />
        </button>
      </div>
      <div className="flex gap-1 mb-3 rounded overflow-hidden h-10">
        {swatches.map((color, i) => <div key={i} className="flex-1" style={{ background: color }} />)}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-fg truncate">{theme.name}</span>
        {isActive && (
          <span className="shrink-0 text-xs font-medium text-accent px-1.5 py-0.5 rounded bg-accent/10">Active</span>
        )}
      </div>
    </div>
  )
}

function NewThemeCard({ onCreate }: { onCreate: (name: string) => void }) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  function submit() {
    const trimmed = name.trim()
    if (trimmed) onCreate(trimmed)
    setNaming(false)
    setName('')
  }

  if (naming) {
    return (
      <div className="rounded-lg border-2 border-dashed border-border p-3 flex flex-col justify-center h-[92px]">
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') { setNaming(false); setName('') }
          }}
          onBlur={submit}
          placeholder="Theme name"
          spellCheck={false}
          className="w-full h-8 px-2 text-sm text-fg bg-bg border border-border rounded focus:outline-none focus:border-accent/60"
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setNaming(true)}
      className="rounded-lg border-2 border-dashed border-border hover:border-fg-muted p-3 flex flex-col items-center justify-center h-[92px] gap-1 text-fg-subtle hover:text-fg transition-colors"
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
        className="rounded-lg border-2 border-dashed border-border hover:border-fg-muted p-3 flex flex-col items-center justify-center h-[92px] gap-1 text-fg-subtle hover:text-fg transition-colors"
      >
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
  const { theme, setTheme, matchSystem, setMatchSystem, setFamily } = useThemeStore()
  const customThemes = useCustomThemeStore((s) => s.themes)
  const activeCustomId = useCustomThemeStore((s) => s.activeId)
  const setActiveCustom = useCustomThemeStore((s) => s.setActive)
  const createFromActive = useCustomThemeStore((s) => s.createFromActive)
  const deleteTheme = useCustomThemeStore((s) => s.deleteTheme)
  const importTheme = useCustomThemeStore((s) => s.importTheme)
  const [editingId, setEditingId] = useState<string | null>(null)

  const variant: 'light' | 'dark' = theme.endsWith('-dark') ? 'dark' : 'light'

  function activateBuiltIn(id: typeof theme) {
    setTheme(id)
    setActiveCustom(null)
    setEditingId(null)
  }

  function activateCustom(id: string) {
    const target = customThemes.find((t) => t.id === id)
    if (!target) return
    setFamily(target.baseFamily)
    setActiveCustom(id)
  }

  function handleCreate(name: string) {
    setEditingId(createFromActive(name))
  }

  function handleImport(json: string): string | null {
    const result = importTheme(json)
    return result.ok ? null : result.error
  }

  return (
    <Section label="Theme">
      <div className="pb-4 pl-3">
        <Toggle
          className="max-w-[60ch] mb-5"
          label="Match system appearance"
          description="Automatically switch this theme between its light and dark variant when macOS does."
          checked={matchSystem}
          onChange={setMatchSystem}
        />
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
          {THEME_OPTIONS.map((t) => {
            const isActive = !activeCustomId && t.id === theme
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => activateBuiltIn(t.id)}
                className={[
                  'text-left rounded-lg border-2 p-3 transition-colors',
                  isActive ? 'border-accent' : 'border-border hover:border-fg-muted',
                ].join(' ')}
              >
                <div className="flex gap-1 mb-3 rounded overflow-hidden h-10">
                  {t.swatches.map((color, i) => <div key={i} className="flex-1" style={{ background: color }} />)}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-fg truncate">{t.name}</span>
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
