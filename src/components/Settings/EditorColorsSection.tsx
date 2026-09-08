import { useDisplayStore, EDITOR_COLOR_SCHEME_OPTIONS, type EditorColorScheme } from '@/stores/displayStore'
import { useThemeStore, type ThemeId } from '@/stores/themeStore'
import { THEME_PALETTES, HIGH_CONTRAST_TOKENS, DEFAULT_TOKENS, MARIO_MODE_BASE, MARIO_MODE_TOKENS } from '@/monacoThemes'
import { Section } from './SettingsLayout'

// Same 4-line snippet for every card so the schemes compare directly.
// Default and High Contrast read from the *active* theme's own palette —
// Default really is just Monaco's stock vs/vs-dark token colors (see
// monacoThemes.ts's `rules: []`), so this previews exactly what the editor
// already looks like today. Mario Mode ignores the active theme entirely —
// same fixed black background and palette no matter what.
function CodePreview({ scheme, themeId }: { scheme: EditorColorScheme; themeId: ThemeId }) {
  const palette = scheme === 'mario-mode' ? MARIO_MODE_BASE : THEME_PALETTES[themeId]
  const tokens = scheme === 'mario-mode' ? MARIO_MODE_TOKENS
    : scheme === 'high-contrast' ? HIGH_CONTRAST_TOKENS[themeId]
    : DEFAULT_TOKENS[THEME_PALETTES[themeId].base]
  return (
    <pre
      className="h-16 w-full overflow-hidden rounded-t-[6px] px-2.5 py-2 text-[10px] leading-[1.5] font-mono whitespace-pre"
      style={{ background: palette.background, color: palette.foreground }}
    >
      <span style={{ color: tokens.comment, fontStyle: 'italic' }}>{'// tidy'}</span>{'\n'}
      <span style={{ color: tokens.keyword }}>const</span> label = <span style={{ color: tokens.string }}>"sum"</span>{'\n'}
      <span style={{ color: tokens.keyword }}>function</span> sum(n: <span style={{ color: tokens.type }}>number[]</span>) {'{'}{'\n'}
      {'  '}<span style={{ color: tokens.keyword }}>return</span> n.reduce((a, b) {'=>'} a + b, <span style={{ color: tokens.number }}>0</span>)
    </pre>
  )
}

export function EditorColorsSection() {
  const editorColorScheme = useDisplayStore((s) => s.editorColorScheme)
  const setEditorColorScheme = useDisplayStore((s) => s.setEditorColorScheme)
  const themeId = useThemeStore((s) => s.theme)

  return (
    <Section label="Editor Colors">
      <div className="pb-4 pl-3">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {EDITOR_COLOR_SCHEME_OPTIONS.map((opt) => {
            const isActive = editorColorScheme === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setEditorColorScheme(opt.value)}
                className={[
                  'text-left rounded-lg border-2 overflow-hidden transition-colors',
                  isActive ? 'border-accent' : 'border-border hover:border-fg-muted',
                ].join(' ')}
              >
                <CodePreview scheme={opt.value} themeId={themeId} />
                <div className={['px-3 py-2', isActive ? 'bg-accent/10' : 'bg-sidebar'].join(' ')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={['text-sm font-medium truncate', isActive ? 'text-fg' : 'text-fg-muted'].join(' ')}>
                      {opt.label}
                    </span>
                    {isActive && (
                      <span className="shrink-0 text-xs font-medium text-accent px-1.5 py-0.5 rounded bg-accent/10">Active</span>
                    )}
                  </div>
                  <div className="text-xs text-fg-subtle mt-0.5 truncate">{opt.description}</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </Section>
  )
}
