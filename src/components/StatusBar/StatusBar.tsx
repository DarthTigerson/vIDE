import { useEffect, useRef, useState } from 'react'
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [gitMenuOpen, setGitMenuOpen] = useState(false)
  const { forceAction, requestForce, closeForce } = useForcePushConfirm(selectedRepo)
  const menuRef = useRef<HTMLDivElement>(null)
  const autocompleteEnabled = useAutocompleteSettingsStore((s) => s.enabled)
  const autocompletePaused = useAutocompleteSessionStore((s) => s.paused)
  const togglePaused = useAutocompleteSessionStore((s) => s.togglePaused)
  const autocompleteBusy = useAutocompleteStatusStore((s) => s.busy)
  const autocompleteActive = autocompleteEnabled && !autocompletePaused
  const [autocompleteMenuOpen, setAutocompleteMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuOpen])

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
        {autocompleteEnabled && (
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
        <div className={['flex items-center gap-1', autocompleteEnabled ? 'ml-2 pl-2 border-l border-border' : ''].join(' ')}>
          <button
            type="button"
            onClick={decrease}
            className="w-5 h-5 flex items-center justify-center hover:text-fg transition-colors"
            aria-label="Decrease font size"
          >
            −
          </button>
          <div className="relative" ref={menuRef}>
            <span
              className="tabular-nums w-6 text-center cursor-default block hover:text-fg transition-colors"
              onContextMenu={(e) => { e.preventDefault(); setMenuOpen((o) => !o) }}
            >
              {fontSize}
            </span>
            {menuOpen && (
              <div className="absolute bottom-full right-0 mb-1 w-36 rounded border border-border bg-popover shadow-lg shadow-black/40 py-1 z-50">
                <button
                  type="button"
                  onClick={() => { reset(); setMenuOpen(false) }}
                  className="w-full text-left px-3 py-1.5 text-xs text-fg hover:bg-white/5 transition-colors"
                >
                  Reset zoom
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={increase}
            className="w-5 h-5 flex items-center justify-center hover:text-fg transition-colors"
            aria-label="Increase font size"
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}
