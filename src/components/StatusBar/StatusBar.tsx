import { useEffect, useRef, useState } from 'react'
import { useGitStore, useRepoGitState } from '@/stores/gitStore'
import { useGitReposStore } from '@/stores/gitReposStore'
import { GitIcon } from '@/components/ActivityBar/ActivityBar'
import { GitActionsMenu } from '@/components/Git/GitActionsMenu'
import { ConfirmForcePushModal } from '@/components/Git/ConfirmForcePushModal'
import { useForcePushConfirm } from '@/components/Git/useForcePushConfirm'
import { useGitResetConfirm } from '@/components/Git/useGitResetConfirm'
import { ConfirmUndoCommitModal } from '@/components/Git/ConfirmUndoCommitModal'
import { ConfirmHardResetModal } from '@/components/Git/ConfirmHardResetModal'
import { GitResetPalette } from '@/components/Git/GitResetPalette'
import { useConfigRepoStore } from '@/stores/configRepoStore'
import { FooterMessage } from './FooterMessage'
import { NotificationPanel } from './NotificationPanel'
import { NotificationBell } from './NotificationBell'
import { NotificationPeek } from './NotificationPeek'
import { FontSizeControl } from './FontSizeControl'
import { Clock } from './Clock'
import { FooterCursor } from './FooterCursor'
import { AlarmFlash } from '@/components/Alarms/AlarmFlash'
import { useAlarmTicker } from '@/hooks/useAlarmTicker'
import { GitActivityBar } from './GitActivityBar'
import { FooterBlame } from './FooterBlame'
import { AutocompleteFooter } from './AutocompleteFooter'
import { FooterTooltip } from './FooterTooltip'

export function StatusBar() {
  useAlarmTicker()
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
  // The quick-actions menu opens above the branch name itself rather than
  // the left edge of the whole repo › branch group (its offset within it).
  const branchNameRef = useRef<HTMLSpanElement>(null)
  const [gitMenuLeft, setGitMenuLeft] = useState(0)
  const { forceAction, requestForce, closeForce } = useForcePushConfirm(selectedRepo)
  const { step: resetStep, requestResetToHead, requestUndoCommit, requestHardReset, pickRef, close: closeReset } = useGitResetConfirm()
  const syncEnabled = useConfigRepoStore((s) => s.enabled)
  const syncRepoUrl = useConfigRepoStore((s) => s.repoUrl)
  const syncStatus = useConfigRepoStore((s) => s.status)
  const syncLabel =
    syncStatus === 'pushing' ? 'Pushing…' :
    syncStatus === 'error' ? 'Sync error — click to retry' :
    syncStatus === 'connecting' ? 'Connecting…' :
    'vIDE Sync — click to push now'
  const syncNow = useConfigRepoStore((s) => s.push)

  useEffect(() => {
    if (!gitMenuOpen) return
    const close = () => setGitMenuOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [gitMenuOpen])

  useEffect(() => {
    refreshBranch(selectedRepo)
    const onFocus = () => refreshBranch(selectedRepo)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [selectedRepo, refreshBranch])

  return (
    <div className="relative h-6 shrink-0 flex items-center justify-between px-3 bg-tab-bar border-t border-border select-none">
      <GitActivityBar />
      <AlarmFlash />
      <FooterMessage />
      {/* Branch, then current-line blame (Settings > Git > Blame: Footer), which truncates first. */}
      <div className="flex items-center gap-3 min-w-0">
        {showBranch && (
          <div className="relative min-w-0">
            <span
              className="flex items-center gap-1 min-w-0 text-fg-muted text-xs cursor-pointer select-none hover:text-fg transition-colors"
              // Left and right click both open the git quick-actions menu.
              // stopPropagation keeps the opening click from reaching the
              // window-level close listener the menu registers.
              onClick={(e) => {
                e.stopPropagation()
                setGitMenuLeft(branchNameRef.current?.offsetLeft ?? 0)
                setGitMenuOpen((o) => !o)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setGitMenuLeft(branchNameRef.current?.offsetLeft ?? 0)
                setGitMenuOpen((o) => !o)
              }}
            >
              <GitIcon
                className={[
                  'w-3 h-3 shrink-0 transition-colors',
                  gitBusy ? 'text-accent animate-pulse' : '',
                ].join(' ')}
              />
              {selectedRepoName && (
                <>
                  <span className="font-bold text-fg truncate shrink-0">{selectedRepoName}</span>
                  <span className="text-fg-subtle shrink-0">›</span>
                </>
              )}
              <span ref={branchNameRef} className="truncate">{branch}</span>
              {commandStatus === 'running' ? (
                <span className="ml-1.5 text-fg-subtle animate-pulse shrink-0">●</span>
              ) : (
                aheadBehind && (
                  <span className="flex items-center gap-1.5 tabular-nums ml-1.5 shrink-0">
                    <span className="flex items-center gap-0.5" aria-label={`${aheadBehind.behind} behind`}>
                      <ArrowDownIcon />
                      {aheadBehind.behind}
                    </span>
                    <span className="flex items-center gap-0.5" aria-label={`${aheadBehind.ahead} ahead`}>
                      <ArrowUpIcon />
                      {aheadBehind.ahead}
                    </span>
                  </span>
                )
              )}
            </span>
            {gitMenuOpen && (
              // Zero-height anchor on the group's top edge, shifted to the
              // branch name; the menu's own bottom-full stacks it above.
              <div className="absolute top-0 h-0" style={{ left: gitMenuLeft }}>
                <GitActionsMenu
                  onClose={() => setGitMenuOpen(false)}
                  onRequestForce={requestForce}
                  onRequestResetToHead={requestResetToHead}
                  onRequestUndoCommit={requestUndoCommit}
                  onRequestHardReset={requestHardReset}
                />
              </div>
            )}
          </div>
        )}
        <FooterBlame showDivider={showBranch} />
      </div>
      {forceAction && selectedRepo && (
        <ConfirmForcePushModal action={forceAction} cwd={selectedRepo} onClose={closeForce} />
      )}
      {resetStep?.kind === 'confirmUndoCommit' && selectedRepo && (
        <ConfirmUndoCommitModal cwd={selectedRepo} onClose={closeReset} />
      )}
      {resetStep?.kind === 'pickRef' && selectedRepo && (
        <GitResetPalette projectRoot={selectedRepo} onClose={closeReset} onPick={pickRef} />
      )}
      {resetStep?.kind === 'confirmHard' && selectedRepo && (
        <ConfirmHardResetModal cwd={selectedRepo} targetRef={resetStep.ref} onClose={closeReset} />
      )}
      <div className="flex items-center gap-1 text-fg-muted text-xs">
        <FooterCursor />
        {(syncEnabled || syncRepoUrl) && (
          <div className="ml-1">
            <FooterTooltip label={syncLabel}>
              <button
                type="button"
                onClick={syncNow}
                disabled={syncStatus === 'pushing' || syncStatus === 'connecting'}
                aria-label={syncLabel}
                className={[
                  // Same rounded/bordered pill as the bell and font-size chip beside it.
                  'flex items-center justify-center h-5 w-5 shrink-0 rounded-full border bg-bg transition-colors disabled:cursor-default',
                  syncStatus === 'pushing' || syncStatus === 'connecting'
                    ? 'border-border text-accent animate-pulse'
                    : syncStatus === 'error'
                      ? 'border-red-400/60 text-red-400 hover:text-red-300 hover:border-red-300'
                      : 'border-border text-fg-muted hover:text-fg hover:border-fg-subtle',
                ].join(' ')}
              >
                <SyncIcon />
              </button>
            </FooterTooltip>
          </div>
        )}
        {/* Its panel carries the inline diff switch, autocomplete on or off. */}
        <div className="ml-1 flex">
          <AutocompleteFooter />
        </div>
        <div className="ml-1">
          <FontSizeControl />
        </div>
        {/* Bell sits right before the clock. Panel and peek anchor to this
            wrapper so they open right above it. */}
        <div className="relative flex ml-1">
          <NotificationBell />
          <NotificationPeek />
          <NotificationPanel />
        </div>
        {/* Clock owns the far-right corner at every width (VIDE-140). */}
        <div className="ml-3">
          <Clock />
        </div>
      </div>
    </div>
  )
}

// Ahead/behind arrows drawn to match the footer's other icons (same 12px
// box and stroke) — the ↓/↑ text glyphs rendered noticeably smaller.
function ArrowDownIcon() {
  return (
    <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4v16m0 0-6-6m6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ArrowUpIcon() {
  return (
    <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 20V4m0 0-6 6m6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SyncIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
