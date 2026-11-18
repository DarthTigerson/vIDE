import { useEditorSettingsStore } from '@/stores/editorSettingsStore'
import { PreviewFrame, MiniCode } from './primitives'

// Live pictures for Settings › Editor (VIDE-145).

export function AutoSavePreview() {
  const autoSave = useEditorSettingsStore((s) => s.autoSaveEnabled)
  return (
    <PreviewFrame testId="autosave-preview">
      <div className="flex border-b border-border px-2 pt-1.5">
        <span className="flex items-center gap-1.5 rounded-t-sm border border-b-0 border-border bg-panel px-2 py-0.5 text-[10.5px] text-fg">
          App.tsx
          {!autoSave && <span data-testid="autosave-dirty-dot" className="h-1.5 w-1.5 rounded-full bg-fg-muted" />}
        </span>
      </div>
      <MiniCode lines={[
        { n: 1, segments: [{ text: 'const', token: 'keyword' }, { text: ' retries = ' }, { text: '5', token: 'number' }] },
      ]} />
      <div className="border-t border-border px-2.5 py-1 text-[10.5px] text-fg-muted">
        {autoSave ? 'Saved automatically a moment after you stop typing.' : 'Unsaved until you press ⌘S.'}
      </div>
    </PreviewFrame>
  )
}

const LONG_LINE = 'const message = `Pushed ${count} commits to ${branch} on ${remote}`'

export function WordWrapPreview() {
  const wrap = useEditorSettingsStore((s) => s.wordWrapEnabled)
  return (
    <PreviewFrame testId="word-wrap-preview">
      <div data-wrap={wrap ? 'true' : 'false'} className="py-1.5 font-mono text-[11px] leading-[1.75]">
        {[LONG_LINE, 'notify(message)'].map((text, i) => (
          <div key={i} className="flex">
            <span className="w-7 shrink-0 pr-2.5 text-right text-fg-subtle">{i + 1}</span>
            <span className={['min-w-0 pr-2', wrap ? 'whitespace-pre-wrap break-all' : 'overflow-hidden whitespace-pre'].join(' ')}>{text}</span>
          </div>
        ))}
      </div>
    </PreviewFrame>
  )
}

export function MarkdownPreview() {
  const mode = useEditorSettingsStore((s) => s.markdownOpenMode)
  const source = (
    <div className="min-w-0 flex-1 px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-fg-muted">
      # Notes<br />- fix sync<br />- ship 0.2.22
    </div>
  )
  const rendered = (
    <div className="min-w-0 flex-1 px-2.5 py-2 text-[10.5px] leading-relaxed text-fg">
      <div className="text-xs font-semibold">Notes</div>• fix sync<br />• ship 0.2.22
    </div>
  )
  return (
    <PreviewFrame testId="markdown-preview">
      <div data-mode={mode} className="flex divide-x divide-border">
        {mode !== 'preview' && source}
        {mode !== 'editor' && rendered}
      </div>
    </PreviewFrame>
  )
}

export function GoToDefinitionPreview() {
  return (
    <PreviewFrame testId="go-to-definition-preview">
      <MiniCode lines={[
        {
          n: 12,
          current: true,
          segments: [{ text: 'const', token: 'keyword' }, { text: ' repo = ' }, { text: 'useRepo', className: 'underline decoration-accent underline-offset-2' }, { text: '()' }],
          trailing: <span className="pl-3 text-fg-subtle">⌘-click → hooks/useRepo.ts</span>,
        },
      ]} />
    </PreviewFrame>
  )
}
