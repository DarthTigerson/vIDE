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

function truncate(v: string, max = 60): string {
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
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-bg-subtle flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-fg">
          {CATEGORY_LABELS[entry.category] ?? entry.category}
        </span>
        <span className="text-xs text-fg-muted">
          {entry.diffKeys.length} key{entry.diffKeys.length !== 1 ? 's' : ''} differ
        </span>
      </div>

      <div className="divide-y divide-border/40 max-h-48 overflow-y-auto">
        {entry.diffKeys.map((key) => {
          const local = entry.localData[key] ?? '(absent)'
          const remote = entry.remoteData[key] ?? '(absent)'
          return (
            <div key={key} className="px-3 py-2">
              <p className="text-xs text-fg-muted mb-1 font-mono truncate">{key}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div
                  className={[
                    'rounded px-2 py-1 border transition-colors',
                    choice === 'local'
                      ? 'border-accent/60 bg-accent/10 text-fg'
                      : 'border-border text-fg-muted',
                  ].join(' ')}
                >
                  <p className="text-[10px] uppercase tracking-wide mb-0.5 text-fg-muted">Yours</p>
                  <p className="font-mono break-all">{truncate(local)}</p>
                </div>
                <div
                  className={[
                    'rounded px-2 py-1 border transition-colors',
                    choice === 'remote'
                      ? 'border-accent/60 bg-accent/10 text-fg'
                      : 'border-border text-fg-muted',
                  ].join(' ')}
                >
                  <p className="text-[10px] uppercase tracking-wide mb-0.5 text-fg-muted">Remote</p>
                  <p className="font-mono break-all">{truncate(remote)}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="px-3 py-2 border-t border-border/40 flex gap-2">
        <button
          type="button"
          onClick={() => onChoose('local')}
          className={[
            'h-7 px-3 rounded text-xs border transition-colors',
            choice === 'local'
              ? 'bg-accent/20 border-accent/50 text-fg'
              : 'border-border text-fg-muted hover:border-fg-subtle hover:text-fg',
          ].join(' ')}
        >
          Use mine
        </button>
        <button
          type="button"
          onClick={() => onChoose('remote')}
          className={[
            'h-7 px-3 rounded text-xs border transition-colors',
            choice === 'remote'
              ? 'bg-accent/20 border-accent/50 text-fg'
              : 'border-border text-fg-muted hover:border-fg-subtle hover:text-fg',
          ].join(' ')}
        >
          Use remote
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-panel border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 border-b border-border/40">
          <h2 className="text-sm font-semibold text-fg">Sync Conflict</h2>
          <p className="text-xs text-fg-muted mt-0.5">
            Your local settings differ from the remote copy. Choose which version to keep for each category.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {categories.map((cat) => (
            <ConflictCategoryRow
              key={cat}
              entry={result.conflicts[cat]}
              choice={choices[cat] ?? null}
              onChoose={(v) => setChoices((s) => ({ ...s, [cat]: v }))}
            />
          ))}
        </div>

        <div className="px-5 py-3 border-t border-border/40 flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => chooseAll('local')}
              className="h-7 px-3 rounded text-xs border border-border text-fg-muted hover:border-fg-subtle hover:text-fg transition-colors"
            >
              Use mine for all
            </button>
            <button
              type="button"
              onClick={() => chooseAll('remote')}
              className="h-7 px-3 rounded text-xs border border-border text-fg-muted hover:border-fg-subtle hover:text-fg transition-colors"
            >
              Use remote for all
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-7 px-3 rounded text-xs border border-border text-fg-muted hover:border-fg-subtle hover:text-fg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!allResolved}
              onClick={() => onResolve(choices)}
              className="h-7 px-3 rounded text-xs bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-40"
            >
              Apply &amp; Sync
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
