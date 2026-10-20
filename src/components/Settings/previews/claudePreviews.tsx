import { useInlineEditSettingsStore } from '@/stores/inlineEditSettingsStore'
import { useCommitMessageSettingsStore } from '@/stores/commitMessageSettingsStore'
import { PreviewFrame, MiniCode } from './primitives'

// Live pictures for Settings › Claude (VIDE-145).

export function InlineEditPreview() {
  const enabled = useInlineEditSettingsStore((s) => s.enabled)
  return (
    <PreviewFrame testId="inline-edit-preview">
      <MiniCode lines={[
        { n: 14, lineClassName: 'bg-accent/15', segments: [{ text: 'await', token: 'keyword' }, { text: ' repo.fetch()' }] },
      ]} />
      {enabled ? (
        <div className="mx-2.5 mb-2.5 flex items-center gap-2 rounded border border-accent/60 bg-popover px-2 py-1 text-[10.5px]">
          <span className="text-fg-subtle">⌘K</span>
          <span className="flex-1 text-fg">Retry three times on failure</span>
          <span className="text-fg-subtle">⏎</span>
        </div>
      ) : (
        <div className="px-2.5 pb-2.5 text-[10.5px] text-fg-subtle">⌘K does nothing while this is off.</div>
      )}
    </PreviewFrame>
  )
}

export function CommitMessagePreview() {
  const enabled = useCommitMessageSettingsStore((s) => s.enabled)
  return (
    <PreviewFrame testId="commit-message-preview" caption="Git panel">
      <div className="m-2.5 mt-1.5 flex items-start gap-2 rounded border border-border bg-panel px-2 py-1.5 text-[10.5px]">
        <span className={['flex-1', enabled ? 'text-fg' : 'text-fg-subtle'].join(' ')}>
          {enabled ? 'Add a footer toggle for the inline diff highlight' : 'Message'}
        </span>
        {enabled && <span data-testid="commit-message-preview-button" className="rounded border border-border px-1 text-accent">✦</span>}
      </div>
    </PreviewFrame>
  )
}
