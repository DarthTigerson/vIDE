import { useEffect, useState } from 'react'
import { useFontSizeStore } from '@/stores/fontSizeStore'
import { useGitStore, useRepoGitState } from '@/stores/gitStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { GitIcon, AutocompleteIcon } from '@/components/ActivityBar/ActivityBar'
import { GitActionsMenu } from '@/components/Git/GitActionsMenu'
import { ConfirmForcePushModal } from '@/components/Git/ConfirmForcePushModal'
import { useForcePushConfirm } from '@/components/Git/useForcePushConfirm'
import { useAutocompleteSettingsStore } from '@/stores/autocompleteSettingsStore'
import { useAutocompleteSessionStore } from '@/stores/autocompleteSessionStore'
import { useAutocompleteStatusStore } from '@/stores/autocompleteStatusStore'
import { AUTOCOMPLETE_FORCE_DISABLED } from '@/lib/autocompleteEffectiveState'
import { FooterMessage } from './FooterMessage'

export function StatusBar() {
  const { fontSize, increase, decrease, reset } = useFontSizeStore()
  const repos = useGitReposStore((s) => s.repos)
  const selectedRepo = useGitReposStore((s) => s.selectedRepo)
  const hasExplicitSelection = useGitReposStore((s) => s.hasExplicitSelection)
  const isMultiRepo = repos.length > 1
  const { branch, aheadBehind, commandStatus, silentFetchInFlight } = useRepoGitState(selectedRepo)
  // In a multi-repo project, stay silent until a repo has actually been
  // picked (dropdown, "Show All Repos" row, or opening a file that
  // resolves to one) — showing the arbitrary first repo's branch with
  // nothing indicating which repo it belongs to is more confusing than
  // showing nothing. Single-repo projects are unaffected (unchanged from
  // before this feature existed).
  const showBranch = !!branch && (!isMultiRepo || hasExplicitSelection)
  const selectedRepoName = selectedRepo?.split('/').pop()
  const gitBusy = commandStatus === 'running' || silentFetchInFlight
  const refreshBranch = useGitStore((s) => s.refresh)
  const [gitMenuOpen, setGitMenuOpen] = useState(false)
  const { forceAction, requestForce, closeForce } = useForcePushConfirm(selectedRepo)
  const autocompleteEnabled = useAutocompleteSettingsStore((s) => s.enabled)
  const autocompletePaused = useAutocompleteSessionStore((s) => s.paused)
  const togglePaused = useAutocompleteSessionStore((s) => s.togglePaused)
  const autocompleteBusy = useAutocompleteStatusStore((s) => s.busy)
  const autocompleteActive = autocompleteEnabled && !autocompletePaused
  const autocompleteVisible = !AUTOCOMPLETE_FORCE_DISABLED && autocompleteEnabled
  const [autocompleteMenuOpen, setAutocompleteMenuOpen] = useState(false)

  useEffect(() => {
    if (!gitMenuOpen) return
    const close = () => setGitMenuOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [gitMenuOpen])

  useEffect(() => {
    if (!autocompleteMenuOpen) return
    const close = () => setAutocompleteMenuOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [autocompleteMenuOpen])

  useEffect(() => {
    refreshBranch(selectedRepo)
    const onFocus = () => refreshBranch(selectedRepo)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [selectedRepo, refreshBranch])

  return (
    <div className="relative h-6 shrink-0 flex items-center justify-between px-3 bg-tab-bar border-t border-border select-none">
      <FooterMessage />
      {showBranch ? (
        <div className="relative min-w-0">
          <span
            className="flex items-center gap-1 min-w-0 text-fg-muted text-xs cursor-default select-none hover:text-fg transition-colors"
            onContextMenu={(e) => { e.preventDefault(); setGitMenuOpen((o) => !o) }}
          >
            <GitIcon
              className={[
                'w-3 h-3 shrink-0 transition-colors',
                gitBusy ? 'text-accent animate-pulse' : '',
              ].join(' ')}
            />
            {isMultiRepo && selectedRepoName && (
              <>
                <span className="font-bold text-fg truncate shrink-0">{selectedRepoName}</span>
                <span className="text-fg-subtle shrink-0">›</span>
              </>
            )}
            <span className="truncate">{branch}</span>
            {commandStatus === 'running' ? (
              <span className="ml-1.5 text-fg-subtle animate-pulse shrink-0">●</span>
            ) : (
              aheadBehind && (
                <span className="flex items-center gap-1.5 tabular-nums ml-1.5 shrink-0">
                  <span>↓{aheadBehind.behind}</span>
                  <span>↑{aheadBehind.ahead}</span>
                </span>
              )
            )}
          </span>
          {gitMenuOpen && (
            <GitActionsMenu onClose={() => setGitMenuOpen(false)} onRequestForce={requestForce} />
          )}
        </div>
      ) : (
        <span />
      )}
      {forceAction && selectedRepo && (
        <ConfirmForcePushModal action={forceAction} cwd={selectedRepo} onClose={closeForce} />
      )}
      <div className="flex items-center gap-1 text-fg-muted text-xs">
        {autocompleteVisible && (
          <div className="relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setAutocompleteMenuOpen((o) => !o) }}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setAutocompleteMenuOpen((o) => !o) }}
              className={[
                'h-5 px-1 flex items-center justify-center transition-colors',
                autocompleteActive && autocompleteBusy
                  ? 'text-accent'
                  : autocompleteActive
                    ? 'text-fg-muted hover:text-fg'
                    : 'text-fg-subtle hover:text-fg-muted',
              ].join(' ')}
              aria-label={autocompleteActive ? 'Autocomplete on' : 'Autocomplete off'}
              title={autocompleteActive ? (autocompleteBusy ? 'Autocomplete: working…' : 'Autocomplete: on') : 'Autocomplete: off'}
            >
              <AutocompleteIcon
                crossedOut={!autocompleteActive}
                busy={autocompleteActive && autocompleteBusy}
              />
            </button>
            {autocompleteMenuOpen && (
              <div className="absolute bottom-full right-0 mb-1 w-56 rounded border border-border bg-popover shadow-lg shadow-black/40 py-1 z-50">
                <button
                  type="button"
                  onClick={() => { togglePaused(); setAutocompleteMenuOpen(false) }}
                  className="w-full text-left px-3 py-1.5 text-xs text-fg hover:bg-white/5 transition-colors"
                >
                  {autocompletePaused ? 'Resume' : 'Pause for this session'}
                </button>
              </div>
            )}
          </div>
        )}
        <div
          className={[
            'flex items-center rounded-full border border-border bg-bg overflow-hidden',
            autocompleteVisible ? 'ml-2' : '',
          ].join(' ')}
        >
          <button
            type="button"
            onClick={decrease}
            aria-label="Decrease font size"
            className="flex h-5 w-6 items-center justify-center text-fg-muted hover:text-fg hover:bg-white/5"
          >
            <MinusIcon />
          </button>
          <button
            type="button"
            onClick={reset}
            aria-label="Reset font size"
            title="Reset font size"
            className="flex h-5 min-w-[1.75rem] items-center justify-center border-x border-border px-1 text-xs tabular-nums text-fg-muted hover:text-fg hover:bg-white/5"
          >
            {fontSize}
          </button>
          <button
            type="button"
            onClick={increase}
            aria-label="Increase font size"
            className="flex h-5 w-6 items-center justify-center text-fg-muted hover:text-fg hover:bg-white/5"
          >
            <PlusIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

// Same pill styling/icons as the browser zoom control (BrowserTab.tsx) —
// duplicated locally since those icons aren't exported from there.
function MinusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
