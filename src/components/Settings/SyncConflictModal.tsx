import { useState } from 'react'
import type { ConflictCheckResult, ConflictEntry } from '../../../electron/configRepo'

interface Props {
  result: ConflictCheckResult
  onResolve: (resolutions: Record<string, 'local' | 'remote'>) => void
  onCancel: () => void
}

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General', models: 'Models', git: 'Git', docker: 'Docker',
  integrations: 'Integrations', notes: 'Notes', todo: 'Todo', jira: 'Jira',
}

function truncate(v: string, max = 48): string {
  return v.length <= max ? v : v.slice(0, max) + '…'
}

function ConflictCategoryRow({
  entry,
  choice,
  onChoose,
}: {
  entry: ConflictEntry
  choice: 'local' | 'remote' | null
  onChoose: (v: 'local' | 'remote') => void
}) {
  return (
    <div className="font-sans">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-fg">
          {CATEGORY_LABELS[entry.category] ?? entry.category}
        </span>
        <span className="text-xs text-fg-muted">
          {entry.diffKeys.length} setting{entry.diffKeys.length !== 1 ? 's' : ''} differ
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          type="button"
          onClick={() => onChoose('local')}
          className={[
            'flex flex-col items-start gap-1 rounded-lg p-3 border text-left transition-all',
            choice === 'local'
              ? 'border-accent bg-accent/10'
              : 'border-border bg-bg hover:border-fg-subtle/50',
          ].join(' ')}
        >
          <span className={[
            'text-xs font-semibold uppercase tracking-wide',
            choice === 'local' ? 'text-accent' : 'text-fg-muted',
          ].join(' ')}>
            {choice === 'local' ? '✓ Keep mine' : 'Keep mine'}
          </span>
          <div className="w-full flex flex-col gap-0.5">
            {entry.diffKeys.slice(0, 3).map((key) => (
              <div key={key} className="text-xs text-fg-muted">
                <span className="text-fg-subtle font-mono text-[10px]">{key.split(':').pop()}</span>
                <span className="ml-1.5 text-fg">{truncate(entry.localData[key] ?? '(none)')}</span>
              </div>
            ))}
            {entry.diffKeys.length > 3 && (
              <span className="text-xs text-fg-muted">+{entry.diffKeys.length - 3} more</span>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChoose('remote')}
          className={[
            'flex flex-col items-start gap-1 rounded-lg p-3 border text-left transition-all',
            choice === 'remote'
              ? 'border-accent bg-accent/10'
              : 'border-border bg-bg hover:border-fg-subtle/50',
          ].join(' ')}
        >
          <span className={[
            'text-xs font-semibold uppercase tracking-wide',
            choice === 'remote' ? 'text-accent' : 'text-fg-muted',
          ].join(' ')}>
            {choice === 'remote' ? '✓ Use remote' : 'Use remote'}
          </span>
          <div className="w-full flex flex-col gap-0.5">
            {entry.diffKeys.slice(0, 3).map((key) => (
              <div key={key} className="text-xs text-fg-muted">
                <span className="text-fg-subtle font-mono text-[10px]">{key.split(':').pop()}</span>
                <span className="ml-1.5 text-fg">{truncate(entry.remoteData[key] ?? '(none)')}</span>
              </div>
            ))}
            {entry.diffKeys.length > 3 && (
              <span className="text-xs text-fg-muted">+{entry.diffKeys.length - 3} more</span>
            )}
          </div>
        </button>
      </div>
    </div>
  )
}

export function SyncConflictModal({ result, onResolve, onCancel }: Props) {
  const categories = Object.keys(result.conflicts)
  const [choices, setChoices] = useState<Record<string, 'local' | 'remote'>>({})

  const allResolved = categories.every((c) => choices[c] !== undefined)

  function chooseAll(v: 'local' | 'remote') {
    const next: Record<string, 'local' | 'remote'> = {}
    for (const c of categories) next[c] = v
    setChoices(next)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 font-sans">
      <div className="bg-panel border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="px-5 pt-5 pb-4">
          <h2 className="text-base font-semibold text-fg mb-1">Sync conflict</h2>
          <p className="text-sm text-fg-muted leading-relaxed">
            The repository already contains different values — likely synced from another machine. Choose which version to keep.
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 flex flex-col gap-5 pb-2">
          {categories.map((cat, i) => (
            <div key={cat}>
              {i > 0 && <div className="border-t border-border/40 mb-5" />}
              <ConflictCategoryRow
                entry={result.conflicts[cat]}
                choice={choices[cat] ?? null}
                onChoose={(v) => setChoices((s) => ({ ...s, [cat]: v }))}
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border/40 flex items-center justify-between gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => chooseAll('local')}
              className="h-8 px-3 rounded-lg text-xs border border-border text-fg-muted hover:text-fg hover:border-fg-subtle transition-colors whitespace-nowrap"
            >
              Keep all mine
            </button>
            <button
              type="button"
              onClick={() => chooseAll('remote')}
              className="h-8 px-3 rounded-lg text-xs border border-border text-fg-muted hover:text-fg hover:border-fg-subtle transition-colors whitespace-nowrap"
            >
              Use all remote
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-8 px-3 rounded-lg text-xs border border-border text-fg-muted hover:text-fg hover:border-fg-subtle transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!allResolved}
              onClick={() => onResolve(choices)}
              className="h-8 px-4 rounded-lg text-xs bg-accent text-white font-medium hover:bg-accent/90 transition-colors disabled:opacity-40 whitespace-nowrap"
            >
              Apply &amp; Sync
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
