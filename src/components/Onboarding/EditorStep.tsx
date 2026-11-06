import type { ReactNode } from 'react'
import { useEditorSettingsStore } from '@/stores/editorSettingsStore'
import { isMac } from '@/lib/platform'

const MOD_KEY = isMac ? '⌘' : 'Ctrl'

// Setup wizard: pick whether files save automatically. Only new installs see
// the wizard, and the store default stays off, so anyone already using vIDE
// keeps the choice they have. The live demo above the choices replays what
// each option does (mockup "B — Rows + live demo"; animations in index.css).
export function EditorStep() {
  const autoSaveEnabled = useEditorSettingsStore((s) => s.autoSaveEnabled)
  const setAutoSaveEnabled = useEditorSettingsStore((s) => s.setAutoSaveEnabled)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-fg">How should files save?</h2>
        <p className="text-xs text-fg-muted mt-0.5">Switch anytime in Settings → Editor.</p>
      </div>

      <AutoSaveDemo auto={autoSaveEnabled} />

      <div role="radiogroup" aria-label="Saving" className="flex flex-col rounded-lg border border-border overflow-hidden">
        <SaveOption
          checked={!autoSaveEnabled}
          onSelect={() => setAutoSaveEnabled(false)}
          title={`Save when I press ${isMac ? '⌘S' : 'Ctrl+S'}`}
          description="Dev servers and watchers react only when you're ready."
        />
        <SaveOption
          checked={autoSaveEnabled}
          onSelect={() => setAutoSaveEnabled(true)}
          title="Save automatically"
          description="Agents and git always see your latest edits."
          divider
        />
      </div>
    </div>
  )
}

function SaveOption({ checked, onSelect, title, description, divider }: {
  checked: boolean
  onSelect: () => void
  title: string
  description: string
  divider?: boolean
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={[
        'flex items-center gap-3 w-full min-h-[56px] px-3.5 py-2.5 text-left transition-colors',
        divider ? 'border-t border-border' : '',
        checked ? 'bg-accent/[0.08] shadow-[inset_2px_0_0_rgb(var(--color-accent))]' : 'hover:bg-white/[0.03]',
      ].join(' ')}
    >
      <span
        className={[
          'flex shrink-0 items-center justify-center w-4 h-4 rounded-full border-[1.5px]',
          checked ? 'border-accent' : 'border-fg-subtle',
        ].join(' ')}
      >
        {checked && <span className="w-[7px] h-[7px] rounded-full bg-accent" />}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-fg">{title}</span>
        <span className="text-xs text-fg-muted">{description}</span>
      </span>
    </button>
  )
}

function Key({ children }: { children: ReactNode }) {
  return (
    <span className="autosave-demo-key inline-flex items-center h-4 px-1.5 rounded-[3px] border border-fg-subtle border-b-2 bg-tab-bar leading-none">
      {children}
    </span>
  )
}

// `key` on the root restarts the loop from the start when the choice flips,
// so the demo always opens with the typing beat.
function AutoSaveDemo({ auto }: { auto: boolean }) {
  return (
    <div key={auto ? 'auto' : 'manual'} data-testid="autosave-demo" aria-hidden="true" className="rounded-lg border border-border bg-panel overflow-hidden">
      <div className="flex items-end px-2 pt-1.5 bg-tab-bar border-b border-border">
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-t bg-panel border-t-2 border-accent text-xs text-fg">
          App.tsx
          <span className={`w-[7px] h-[7px] rounded-full bg-accent ${auto ? 'autosave-demo-dirty-auto' : 'autosave-demo-dirty-manual'}`} />
        </span>
      </div>
      <div className="px-3 py-2.5 font-mono text-xs leading-5 text-fg">
        <div>
          <span className="inline-block w-5 text-fg-subtle">1</span>
          <span className="text-accent">import</span> {'{ run }'} <span className="text-accent">from</span>{' '}
          <span className="text-fg-muted">'./job'</span>
        </div>
        <div>
          <span className="inline-block w-5 text-fg-subtle">2</span>
          <span className="autosave-demo-typed">
            <span className="text-accent">const</span> retries = 5; run()
          </span>
          <span className="autosave-demo-caret" />
        </div>
      </div>
      <div className="flex items-center justify-between h-[26px] px-3 border-t border-border text-[11px] text-fg-muted">
        {auto ? (
          <>
            <span className="relative flex-1 h-full">
              <span className="autosave-demo-typing absolute left-0 top-1.5">Typing…</span>
              <span className="autosave-demo-saved absolute left-0 top-[5px] flex items-center gap-1 text-fg">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                  <path d="M3.5 8.5l3 3 6-7" />
                </svg>
                Saved
              </span>
            </span>
            <span>Auto save</span>
          </>
        ) : (
          <>
            <span>Unsaved changes</span>
            <span className="flex items-center gap-1">
              <Key>{MOD_KEY}</Key>
              <Key>S</Key>
              <span className="ml-0.5">to save</span>
            </span>
          </>
        )}
      </div>
    </div>
  )
}
