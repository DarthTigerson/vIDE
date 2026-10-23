import { useState } from 'react'
import { Switch } from '@/components/ui/Toggle'
import { ConfirmActionModal } from '@/components/Git/ConfirmActionModal'
import { useFileStore } from '@/stores/fileStore'
import { useGraphifySettingsStore } from '@/stores/graphifySettingsStore'
import {
  GLOBAL_RULES_KEY,
  selectOwnRules,
  useTreeHidingStore,
  type RuleKind,
} from '@/stores/treeHidingStore'
import { repoKey, ruleCount, type HideToggle } from '@/lib/treeHiding'
import { FeatureBlock, SettingRow } from './FeatureBlock'

const KIND_LABELS: Record<RuleKind, string> = { paths: 'path', names: 'name', extensions: 'extension' }

const HIDE_SWITCHES: { toggle: HideToggle; label: string; description?: string }[] = [
  { toggle: 'showHidden', label: 'Hidden items', description: 'The rules above. Off shows them faded.' },
  { toggle: 'showGitignored', label: 'Gitignored items' },
  { toggle: 'showDotfiles', label: 'Dotfiles' },
  { toggle: 'showGraphify', label: 'Graphify output' },
]

function repoName(key: string): string {
  return key === GLOBAL_RULES_KEY ? 'All repos' : key.split('/').filter(Boolean).pop() ?? key
}

const dangerButton = 'shrink-0 rounded-md border border-red-500/40 px-3 py-1 text-xs text-red-300 transition-colors hover:bg-red-500/15 hover:text-red-200'

// Settings › Site Tree: every repo's hide rules (set from the tree's
// right-click Hide submenu) plus the rules that apply to all repos, with
// per-repo Hide switches and resets.
export function HiddenItemsSettings() {
  const byRepo = useTreeHidingStore((s) => s.byRepo)
  const projectRoot = useFileStore((s) => s.projectRoot)
  const graphifyEnabled = useGraphifySettingsStore((s) => s.enabled)
  const { moveRule, removeRule, resetKey, resetAll, setToggleForKey } = useTreeHidingStore.getState()
  const currentKey = projectRoot ? repoKey(projectRoot) : null
  const [selected, setSelected] = useState<string>(currentKey ?? GLOBAL_RULES_KEY)
  const [confirm, setConfirm] = useState<'repo' | 'all' | null>(null)

  // The open repo first, then every other repo that has rules saved.
  const repoKeys = [
    ...(currentKey ? [currentKey] : []),
    ...Object.keys(byRepo).filter((k) => k !== GLOBAL_RULES_KEY && k !== currentKey).sort(),
  ]
  const isGlobal = selected === GLOBAL_RULES_KEY
  const rules = selectOwnRules(byRepo, selected)
  const rowsOf = (from: string) =>
    (Object.keys(KIND_LABELS) as RuleKind[]).flatMap((kind) => selectOwnRules(byRepo, from)[kind].map((value) => ({ from, kind, value })))
  // A repo's list starts with the All repos rules that also hide items in it,
  // marked, then its own.
  const rows = isGlobal ? rowsOf(GLOBAL_RULES_KEY) : [...rowsOf(GLOBAL_RULES_KEY), ...rowsOf(selected)]

  function repoButton(repo: string) {
    const active = repo === selected
    return (
      <button
        key={repo}
        type="button"
        aria-pressed={active}
        onClick={() => setSelected(repo)}
        className={[
          'flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
          active ? 'bg-white/5 text-fg' : 'text-fg-muted hover:bg-white/5 hover:text-fg',
        ].join(' ')}
      >
        <span className="truncate">{repoName(repo)}</span>
        <span className="shrink-0 rounded-full bg-border px-1.5 text-[0.625rem] text-fg-muted">{ruleCount(selectOwnRules(byRepo, repo))}</span>
      </button>
    )
  }

  return (
    <>
      <FeatureBlock
        title="Hidden items"
        description="Pick All repos for rules that apply everywhere, or a repo for its own rules and Hide switches. Add rules from the Site Tree's right-click Hide menu."
      >
        <div className="mt-2 flex h-64 max-w-[760px] overflow-hidden rounded-md border border-border">
          <div className="w-56 shrink-0 space-y-0.5 overflow-y-auto border-r border-border p-1">
            {repoButton(GLOBAL_RULES_KEY)}
            <div className="mx-1 my-1 h-px bg-border" />
            {repoKeys.map(repoButton)}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 text-xs text-fg">
              <span className="min-w-0 flex-1 truncate">
                {repoName(selected)}
                {!isGlobal && <span className="ml-2 text-fg-subtle">{selected}</span>}
              </span>
              <button type="button" disabled={ruleCount(rules) === 0 && !byRepo[selected]} onClick={() => setConfirm('repo')} className={`${dangerButton} disabled:opacity-40`}>
                {`Reset ${repoName(selected)}`}
              </button>
            </div>
            <ul className="flex-1 overflow-y-auto">
              {rows.length === 0 && <li className="px-3 py-2 text-xs text-fg-subtle">Nothing hidden.</li>}
              {rows.map(({ from, kind, value }) => {
                return (
                <li key={`${from}:${kind}:${value}`} className="flex h-9 items-center gap-2.5 border-t border-border/60 px-3 text-sm text-fg first:border-t-0">
                  <span className="w-20 shrink-0 text-xs text-fg-muted">{KIND_LABELS[kind]}</span>
                  <span className="min-w-0 flex-1 truncate">{kind === 'extensions' ? `.${value}` : value}</span>
                  {!isGlobal && from === GLOBAL_RULES_KEY && (
                    <span className="shrink-0 rounded-full bg-accent/15 px-1.5 text-[0.625rem] text-accent">all repos</span>
                  )}
                  {from !== GLOBAL_RULES_KEY && (
                    <button
                      type="button"
                      onClick={() => moveRule(from, GLOBAL_RULES_KEY, kind, value)}
                      className="shrink-0 rounded border border-border px-2 py-0.5 text-[0.6875rem] text-fg-muted transition-colors hover:bg-white/5 hover:text-fg"
                    >
                      Make global
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${value}`}
                    onClick={() => removeRule(from, kind, value)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-subtle hover:bg-white/10 hover:text-fg"
                  >
                    ×
                  </button>
                </li>
                )
              })}
            </ul>
          </div>
        </div>

        {!isGlobal && (
          <div className="mt-4">
            <div className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-muted">{`Hide in ${repoName(selected)}`}</div>
            {HIDE_SWITCHES.filter((s) => s.toggle !== 'showGraphify' || graphifyEnabled).map(({ toggle, label, description }) => (
              <SettingRow key={toggle} label={label} description={description}>
                <Switch
                  label={`Hide ${label.toLowerCase()}`}
                  checked={!rules[toggle]}
                  onChange={(hide) => setToggleForKey(selected, toggle, !hide)}
                />
              </SettingRow>
            ))}
          </div>
        )}
      </FeatureBlock>

      <FeatureBlock
        title="Reset all hidden items"
        description="Clears the rules of every repo and All repos, and puts every repo's Hide switches back to their defaults."
      >
        <button type="button" disabled={Object.keys(byRepo).length === 0} onClick={() => setConfirm('all')} className={`${dangerButton} mt-1 disabled:opacity-40`}>
          Master Reset
        </button>
      </FeatureBlock>

      {confirm === 'repo' && (
        <ConfirmActionModal
          title={`Reset ${repoName(selected)}`}
          message={isGlobal
            ? 'Remove every rule that applies to all repos?'
            : `Remove every hide rule in ${repoName(selected)} and put its Hide switches back to their defaults?`}
          confirmLabel="Reset"
          onConfirm={() => {
            resetKey(selected)
            // A repo that isn't open drops out of the list once it has no rules.
            if (selected !== currentKey) setSelected(GLOBAL_RULES_KEY)
          }}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'all' && (
        <ConfirmActionModal
          title="Reset all hidden items"
          message="Remove every hide rule in every repo and in All repos, and put all Hide switches back to their defaults?"
          confirmLabel="Master Reset"
          onConfirm={resetAll}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  )
}
